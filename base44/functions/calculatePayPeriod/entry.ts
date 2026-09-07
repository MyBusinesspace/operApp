import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { pay_period_id } = await req.json();
    if (!pay_period_id) return Response.json({ error: 'pay_period_id is required' }, { status: 400 });

    // ── Load pay period ────────────────────────────────────────────────────────
    const periods = await base44.asServiceRole.entities.PayPeriod.filter({ id: pay_period_id });
    const period = Array.isArray(periods) ? periods[0] : null;
    if (!period) return Response.json({ error: 'Pay period not found' }, { status: 404 });

    // ── Load payroll settings ──────────────────────────────────────────────────
    const settingsList = await base44.asServiceRole.entities.PayrollSettings.list();
    const settings = (Array.isArray(settingsList) ? settingsList[0] : null) || {};
    const overtimeMultiplier = settings.overtime_multiplier || 1.5;
    const overtimeThresholdDaily = settings.overtime_threshold_daily_h || 8;
    const overtimeThresholdWeekly = settings.overtime_threshold_weekly_h || 40;
    const lateDeductionPerMinute = settings.late_deduction_per_minute || 0;
    const workingDaysPerWeek = settings.working_days_per_week || 5;
    const workingHoursPerDay = settings.working_hours_per_day || 8;
    const defaultTaxRate = settings.default_tax_rate || 0;
    const gratuityEnabled = settings.gratuity_enabled !== false;
    const gratuityYearsThreshold = settings.gratuity_years_threshold ?? 1;
    const gratuityDaysPerYear = settings.gratuity_days_per_year ?? 21;
    const annualLeaveBonusEnabled = settings.annual_leave_bonus_enabled !== false;

    // ── Organization timezone (for local date grouping — must match the Overtime Report) ──
    const orgs = await base44.asServiceRole.entities.Organization.list();
    const orgTimezone = (Array.isArray(orgs) && orgs[0]?.timezone) || 'Asia/Dubai';
    function localDateKey(isoStr: string): string {
      try {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: orgTimezone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date(isoStr));
      } catch { return new Date(isoStr).toISOString().slice(0, 10); }
    }

    // ── Location-based tax table ───────────────────────────────────────────────
    // Rates are % of taxable income. Bracket thresholds in annual AED equivalents.
    // Structure: { [country]: { [status]: rate% | bracket_fn } }
    // For simplicity we use effective flat rates per status tier.
    // These are approximations for payroll withholding — consult local regulations.
    const TAX_TABLE = {
      AE: { resident: 0, non_resident: 0, expat: 0, exempt: 0 },       // UAE: no income tax
      SA: { resident: 0, non_resident: 20, expat: 20, exempt: 0 },      // Saudi: no personal tax; 20% for NR corp
      US: { resident: 22, non_resident: 30, expat: 22, exempt: 0 },     // US: flat withholding estimates
      UK: { resident: 20, non_resident: 20, expat: 20, exempt: 0 },     // UK: basic rate
      IN: { resident: 10, non_resident: 30, expat: 30, exempt: 0 },     // India: approx. slab
      PH: { resident: 20, non_resident: 25, expat: 25, exempt: 0 },     // Philippines
      PK: { resident: 10, non_resident: 20, expat: 20, exempt: 0 },     // Pakistan
      EG: { resident: 15, non_resident: 20, expat: 20, exempt: 0 },     // Egypt
      DE: { resident: 25, non_resident: 15, expat: 25, exempt: 0 },     // Germany
      FR: { resident: 24, non_resident: 20, expat: 24, exempt: 0 },     // France
    };

    function resolveLocationTaxRate(profile, fallbackRate) {
      // If manual override is set, always use it
      if (profile.tax_rate_override !== undefined && profile.tax_rate_override !== null && profile.tax_rate_override !== '') {
        return { rate: Number(profile.tax_rate_override), source: 'manual_override' };
      }
      const country = (profile.tax_country || 'AE').toUpperCase();
      const status  = profile.tax_status || 'resident';
      const countryRates = TAX_TABLE[country];
      if (countryRates && countryRates[status] !== undefined) {
        return { rate: countryRates[status], source: `${country}/${status}` };
      }
      // Country exists but status not found — use resident rate
      if (countryRates) {
        return { rate: countryRates['resident'] || fallbackRate, source: `${country}/resident_fallback` };
      }
      // Unknown country — fall back to global default
      return { rate: fallbackRate, source: 'global_default' };
    }

    // ── Compute working days in period ─────────────────────────────────────────
    const periodStart = new Date(period.start_date);
    const periodEnd = new Date(period.end_date);
    periodEnd.setHours(23, 59, 59);

    const workingDaysInPeriod = countWorkingDays(periodStart, periodEnd, workingDaysPerWeek);

    // ── Load all employee payroll profiles ─────────────────────────────────────
    // If the pay period has a specific worker selection, filter to those employees only.
    // Empty / missing selected_employee_ids = all active employees.
    let profiles = await base44.asServiceRole.entities.EmployeePayrollProfile.filter({ is_active: true });
    if (Array.isArray(period.selected_employee_ids) && period.selected_employee_ids.length > 0) {
      const selectedSet = new Set(period.selected_employee_ids);
      profiles = profiles.filter(p => selectedSet.has(p.employee_id));
    }

    // ── Load employees (for hire_date → years of service for gratuity) ──
    const allEmployees = await base44.asServiceRole.entities.Employee.list();

    // ── Load time entries for the period ───────────────────────────────────────
    const allTimeEntries = await base44.asServiceRole.entities.TimeEntry.list("-clock_in_time", 5000);
    const periodEntries = allTimeEntries.filter(te => {
      // Support both field names and both status values
      const clockInRaw = te.clock_in || te.clock_in_time;
      if (!clockInRaw) return false;
      const d = new Date(clockInRaw);
      const statusOk = te.status === 'clocked_out' || te.status === 'Completed' || te.status === 'completed' || te.status === 'Switched';
      return d >= periodStart && d <= periodEnd && statusOk;
    });

    // ── Load active loans for deduction ───────────────────────────────────────
    const allLoans = await base44.asServiceRole.entities.EmployeeLoan.filter({ status: 'active' });

    // ── Load leave requests overlapping this pay period ──────────────────────
    // Absence is now driven ENTIRELY by leave records (no clock-in inference):
    //   approved + vacation/sick/other → justified, payable → paid leave days
    //   approved + unjustified         → not justified, not payable → unpaid absence (deduction)
    //   rejected + salary deduction in admin_notes → fixed AED deduction (no day effect)
    //   pending / cancelled → ignored (no payroll effect)
    const SALARY_DEDUCT_RE = /Deduct\s+([\d.]+)\s+AED\s+of\s+salary/i;
    const allLeaveRequests = await base44.asServiceRole.entities.LeaveRequest.list();
    const periodLeaves = allLeaveRequests.filter(lr => {
      if (!lr.start_date || !lr.end_date) return false;
      if (lr.status === 'approved') {
        // approved leaves — always included
      } else if (lr.status === 'rejected' && lr.admin_notes && SALARY_DEDUCT_RE.test(lr.admin_notes)) {
        // rejected with a recorded salary deduction — include so the amount is applied
      } else {
        return false;
      }
      const lrStart = new Date(lr.start_date);
      const lrEnd = new Date(lr.end_date);
      lrEnd.setHours(23, 59, 59);
      return lrStart <= periodEnd && lrEnd >= periodStart;
    });

    // ── Delete ALL existing entries for this period (recalculate) ───────────────
    // Previously only draft entries were removed, which left reviewed/approved
    // entries in place and produced duplicate rows when recalculating a period
    // that had already advanced past "draft". A recalculation regenerates every
    // entry from source data, so we wipe the whole set first.
    const existingEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ pay_period_id });
    for (const e of existingEntries) {
      await base44.asServiceRole.entities.PayrollEntry.delete(e.id);
    }

    const results = [];

    for (const profile of profiles) {
      const employeeId = profile.employee_id;
      const employee = allEmployees.find(e => e.id === employeeId);

      // Time entries for this employee
      const empEntries = periodEntries.filter(te => te.employee_id === employeeId);

      // Hours calculation
      let totalMinutes = 0;
      let lateMinutes = 0;

      for (const te of empEntries) {
        const clockInRaw = te.clock_in || te.clock_in_time;
        const duration = te.duration_minutes || (te.clock_out_time && clockInRaw
          ? Math.round((new Date(te.clock_out_time).getTime() - new Date(clockInRaw).getTime()) / 60000)
          : 0);
        totalMinutes += duration;
        if (te.late_minutes) lateMinutes += Number(te.late_minutes) || 0;
      }

      const totalHours = totalMinutes / 60;

      // Overtime vs regular split
      let regularHours = 0;
      let overtimeHours = 0;

      // ── Overtime calculation (per-day, same method as the Overtime Report) ──
      // Every employee — salaried or hourly — gets overtime computed per day
      // using the daily-hours threshold. Manager overrides on individual entries
      // take precedence (0 = force zero OT). This keeps payroll overtime
      // consistent with the Overtime Report.
      let otMinsTotal = 0;
      let regMinsTotal = 0;
      let otPayTotal = 0;
      // Base hourly rate for overtime (same base as the Overtime Report)
      const otBaseHourly = profile.pay_type === 'hourly'
        ? (profile.hourly_rate || 0)
        : (profile.basic_salary || 0) / ((settings.working_days_per_month || workingDaysInPeriod) * workingHoursPerDay);

      // Per-day OT: group entries by day, compute OT from daily total hours vs threshold.
      // Overtime is based on TOTAL hours worked in a day, not per individual entry.
      const entriesByDay: Record<string, any[]> = {};
      for (const te of empEntries) {
        const clockInRaw = te.clock_in || te.clock_in_time;
        if (!clockInRaw) continue;
        const dateStr = localDateKey(clockInRaw);
        if (!entriesByDay[dateStr]) entriesByDay[dateStr] = [];
        entriesByDay[dateStr].push(te);
      }

      for (const dateStr of Object.keys(entriesByDay)) {
        const dayEntries = entriesByDay[dateStr];
        let dayTotalMins = 0;
        let dayOverrideMins = 0;
        let dayHasOverride = false;
        for (const te of dayEntries) {
          // Fall back to computing from timestamps when duration_minutes is missing —
          // same as the Overtime Report, so per-day OT totals match exactly.
          const clockInRaw = te.clock_in || te.clock_in_time;
          const dur = te.duration_minutes || (te.clock_out_time && clockInRaw
            ? Math.round((new Date(te.clock_out_time).getTime() - new Date(clockInRaw).getTime()) / 60000)
            : 0);
          dayTotalMins += dur;
          if (te.overtime_override_minutes != null) {
            dayHasOverride = true;
            dayOverrideMins += te.overtime_override_minutes;
          }
        }
        const thresholdMins = (settings.overtime_threshold_daily_h || overtimeThresholdDaily) * 60;
        let otMins = 0;
        if (dayHasOverride) {
          otMins = Math.max(0, dayOverrideMins);
        } else {
          otMins = Math.max(0, dayTotalMins - thresholdMins);
        }
        const regMins = Math.min(dayTotalMins, thresholdMins);

        // Overtime pay — day-type-aware multipliers (same as Overtime Report)
        if (otMins > 0) {
          const holidays = settings.public_holidays || [];
          const isHoliday = holidays.includes(dateStr);
          const isSun = new Date(dateStr + 'T12:00:00').getDay() === 0;
          const dayType = isHoliday ? 'holiday' : isSun ? 'sunday' : 'regular';
          let otRate = 0;
          if (dayType === 'holiday') {
            const fixed = parseFloat(settings.overtime_fixed_rate_holiday);
            otRate = !isNaN(fixed) && fixed > 0 ? fixed : otBaseHourly * (settings.overtime_multiplier_holiday || 2.0);
          } else if (dayType === 'sunday') {
            const fixed = parseFloat(settings.overtime_fixed_rate_sunday);
            otRate = !isNaN(fixed) && fixed > 0 ? fixed : otBaseHourly * (settings.overtime_multiplier_sunday || 2.0);
          } else {
            const fixed = parseFloat(settings.overtime_fixed_rate);
            otRate = !isNaN(fixed) && fixed > 0 ? fixed : otBaseHourly * overtimeMultiplier;
          }
          otPayTotal += otRate * (otMins / 60);
        }
        otMinsTotal += otMins;
        regMinsTotal += regMins;
      }
      regularHours = regMinsTotal / 60;
      overtimeHours = otMinsTotal / 60;

      // ── Absence is driven ENTIRELY by leave records (no clock-in inference) ──
      // Each working day in the period is classified by the leave covering it:
      //   approved → paid leave day (justified, payable)
      //   rejected → unpaid absence day (not justified, not payable → deduction)
      //   no leave → present (no deduction). Clock-in data still feeds hours/OT only.
      const empLeaves = periodLeaves.filter(lr => lr.employee_id === employeeId);
      const paidDaysSet = new Set();
      const unpaidDaysSet = new Set();
      const maxDow = workingDaysPerWeek >= 6 ? 6 : 5;
      for (const lv of empLeaves) {
        if (lv.status !== 'approved') continue; // rejected salary deductions handled separately below
        const lvStart = new Date(lv.start_date);
        const lvEnd = new Date(lv.end_date);
        lvEnd.setHours(23, 59, 59);
        const overlapStart = lvStart > periodStart ? lvStart : periodStart;
        const overlapEnd = lvEnd < periodEnd ? lvEnd : periodEnd;
        if (overlapStart > overlapEnd) continue;
        const cur = new Date(overlapStart);
        while (cur <= overlapEnd) {
          const dow = cur.getDay();
          if (dow >= 1 && dow <= maxDow) {
            const key = cur.toISOString().slice(0, 10);
            if (lv.leave_type === 'unjustified') {
              // Approved unjustified absence → unpaid (deducted)
              if (!paidDaysSet.has(key)) unpaidDaysSet.add(key);
            } else {
              // Approved justified leave → paid
              unpaidDaysSet.delete(key);
              paidDaysSet.add(key);
            }
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
      const paidLeaveDays = paidDaysSet.size;
      const unpaidAbsentDays = unpaidDaysSet.size;
      const absentDays = paidLeaveDays + unpaidAbsentDays;
      const daysPresent = Math.max(0, workingDaysInPeriod - absentDays);

      // ── Approved VACATION overlap (triggers annual leave bonus + gratuity) ──
      const hasVacationInPeriod = empLeaves.some(lr => lr.status === 'approved' && lr.leave_type === 'vacation');
      const periodYear = periodStart.getFullYear();
      let yearsOfService = 0;
      if (employee?.hire_date) {
        const hire = new Date(employee.hire_date);
        yearsOfService = (periodStart - hire) / (365.25 * 24 * 3600 * 1000);
        yearsOfService = Math.floor(yearsOfService * 10) / 10;
      }
      const gratuityEligible = gratuityEnabled && yearsOfService >= gratuityYearsThreshold;
      const bonusAlreadyThisYear = profile.last_annual_bonus_year === periodYear;
      const gratuityAlreadyThisYear = profile.last_gratuity_year === periodYear;

      // ── Pay calculation ────────────────────────────────────────────────────
      let basicSalary = 0;
      let overtimePay = 0;
      let absenceDeduction = 0;
      let lateDeduction = 0;

      if (profile.pay_type === 'salary') {
        // Daily rate for absence deduction uses TOTAL salary (basic + fixed earning allowances)
        const fixedAllowances = (profile.components || [])
          .filter(c => c.type === 'earning' && (c.calculation_method === 'fixed' || c.calculation_method === 'percentage_of_basic'))
          .reduce((s, c) => {
            if (c.calculation_method === 'fixed') return s + (c.value || 0);
            if (c.calculation_method === 'percentage_of_basic') return s + ((c.value || 0) / 100) * (profile.basic_salary || 0);
            return s;
          }, 0);
        const totalSalaryForRate = (profile.basic_salary || 0) + fixedAllowances;
        const dailyRate = totalSalaryForRate / workingDaysInPeriod;

        // Keep full basic salary; unpaid absences are deducted once via absenceDeduction below.
        basicSalary = (profile.basic_salary || 0);
        overtimePay = otPayTotal;
        absenceDeduction = dailyRate * unpaidAbsentDays;
        lateDeduction = lateMinutes * lateDeductionPerMinute;

      } else if (profile.pay_type === 'hourly') {
        const hourlyRate = profile.hourly_rate || 0;
        basicSalary = regularHours * hourlyRate;
        overtimePay = otPayTotal;
        absenceDeduction = 0;
        lateDeduction = lateMinutes * lateDeductionPerMinute;
      }

      // ── Components (allowances / deductions) ──────────────────────────────
      const lineItems = [];
      let allowancesTotal = 0;

      for (const comp of (profile.components || [])) {
        let amount = 0;
        if (comp.calculation_method === 'fixed') {
          amount = comp.value || 0;
        } else if (comp.calculation_method === 'percentage_of_basic') {
          amount = ((comp.value || 0) / 100) * (profile.basic_salary || 0);
        } else if (comp.calculation_method === 'percentage_of_gross') {
          // will recalculate after gross is known
          amount = 0; // placeholder
        }

        lineItems.push({
          component_id: comp.component_id,
          component_name: comp.component_name,
          component_code: comp.component_code || '',
          type: comp.type,
          amount,
          notes: `${comp.calculation_method} — value: ${comp.value}`,
        });

        if (comp.type === 'earning') allowancesTotal += amount;
      }

      let grossPay = basicSalary + allowancesTotal + overtimePay;

      // Recalculate percentage_of_gross components now that gross is known
      for (const li of lineItems) {
        const comp = (profile.components || []).find(c => c.component_id === li.component_id);
        if (comp?.calculation_method === 'percentage_of_gross') {
          li.amount = ((comp.value || 0) / 100) * grossPay;
          if (comp.type === 'earning') allowancesTotal += li.amount;
        }
      }

      // ── Annual Leave Bonus + Gratuity (paid in the month of approved vacation) ──
      let annualLeaveBonus = 0;
      let gratuityAmount = 0;
      if (hasVacationInPeriod) {
        const gratuityDailyRate = (profile.basic_salary || 0) / 30;
        if (annualLeaveBonusEnabled && !bonusAlreadyThisYear) {
          annualLeaveBonus = profile.basic_salary || 0;
          lineItems.push({
            component_id: null,
            component_name: 'Annual Leave Bonus',
            component_code: 'ALB',
            type: 'earning',
            amount: annualLeaveBonus,
            notes: 'One month basic salary — paid in vacation month',
          });
        }
        if (gratuityEligible && !gratuityAlreadyThisYear) {
          gratuityAmount = Math.round(gratuityDailyRate * gratuityDaysPerYear * 100) / 100;
          lineItems.push({
            component_id: null,
            component_name: 'Gratuity (Annual)',
            component_code: 'GRT',
            type: 'earning',
            amount: gratuityAmount,
            notes: `${gratuityDaysPerYear} days × daily rate — ${yearsOfService} yrs of service`,
          });
        }
        grossPay += annualLeaveBonus + gratuityAmount;
        allowancesTotal += annualLeaveBonus + gratuityAmount;
      }

      // ── Loan deductions ────────────────────────────────────────────────────
      const empLoans = allLoans.filter(l => l.employee_id === employeeId);
      let loanDeduction = 0;
      for (const loan of empLoans) {
        loanDeduction += loan.monthly_deduction || 0;
      }

      // ── Rejected leave salary deductions (fixed AED from admin_notes) ──────
      let rejectedSalaryDeduction = 0;
      for (const lv of empLeaves) {
        if (lv.status !== 'rejected' || !lv.admin_notes) continue;
        const m = lv.admin_notes.match(SALARY_DEDUCT_RE);
        if (m) rejectedSalaryDeduction += parseFloat(m[1]) || 0;
      }
      if (rejectedSalaryDeduction > 0) {
        lineItems.push({
          component_id: null,
          component_name: 'Rejected Leave Salary Deduction',
          component_code: 'RLD',
          type: 'deduction',
          amount: rejectedSalaryDeduction,
          notes: 'Fixed AED deduction from rejected leave request',
        });
      }

      const totalDeductions = absenceDeduction + lateDeduction + loanDeduction + rejectedSalaryDeduction;

      // ── Tax — location & status aware ─────────────────────────────────────
      const { rate: taxRate, source: taxSource } = resolveLocationTaxRate(profile, defaultTaxRate);
      const taxableIncome = grossPay - totalDeductions;
      const taxAmount = Math.round(((taxableIncome * taxRate) / 100) * 100) / 100;

      // Add tax as a line item so it appears in the payroll summary breakdown
      if (taxAmount > 0) {
        lineItems.push({
          component_id: null,
          component_name: `Income Tax (${profile.tax_country || 'AE'} — ${(profile.tax_status || 'resident').replace(/_/g, ' ')})`,
          component_code: 'TAX',
          type: 'tax',
          amount: taxAmount,
          notes: `${taxRate}% — source: ${taxSource}`,
        });
      }

      const netPay = grossPay - totalDeductions - taxAmount;

      // ── Create PayrollEntry ────────────────────────────────────────────────
      const entry = await base44.asServiceRole.entities.PayrollEntry.create({
        pay_period_id,
        pay_period_name: period.name,
        employee_id: employeeId,
        employee_name: employee?.full_name || profile.employee_name,
        employment_type: profile.employment_type,
        pay_type: profile.pay_type,
        regular_hours: Math.round(regularHours * 100) / 100,
        overtime_hours: Math.round(overtimeHours * 100) / 100,
        absent_days: absentDays,
        paid_leave_days: paidLeaveDays,
        late_minutes: lateMinutes,
        working_days_in_period: workingDaysInPeriod,
        days_present: daysPresent,
        basic_salary: Math.round(basicSalary * 100) / 100,
        allowances_total: Math.round(allowancesTotal * 100) / 100,
        overtime_pay: Math.round(overtimePay * 100) / 100,
        bonus: 0,
        gross_pay: Math.round(grossPay * 100) / 100,
        absence_deduction: Math.round(absenceDeduction * 100) / 100,
        late_deduction: Math.round(lateDeduction * 100) / 100,
        loan_deduction: Math.round(loanDeduction * 100) / 100,
        other_deductions: Math.round(rejectedSalaryDeduction * 100) / 100,
        total_deductions: Math.round(totalDeductions * 100) / 100,
        taxable_income: Math.round(taxableIncome * 100) / 100,
        tax_amount: Math.round(taxAmount * 100) / 100,
        net_pay: Math.round(netPay * 100) / 100,
        status: 'draft',
        time_entries_count: empEntries.length,
        line_items: lineItems,
      });

      results.push({ employee_id: employeeId, employee_name: employee?.full_name || profile.employee_name, entry_id: entry.id, net_pay: entry.net_pay });

      // ── Mark annual bonus / gratuity year on profile (prevents double pay) ──
      if (hasVacationInPeriod && (annualLeaveBonus > 0 || gratuityAmount > 0)) {
        const yrPatch = {};
        if (annualLeaveBonus > 0) yrPatch.last_annual_bonus_year = periodYear;
        if (gratuityAmount > 0) yrPatch.last_gratuity_year = periodYear;
        try {
          await base44.asServiceRole.entities.EmployeePayrollProfile.update(profile.id, yrPatch);
        } catch {}
      }
    }

    // ── Update PayPeriod totals ────────────────────────────────────────────────
    const totalGross = results.reduce((s, r) => s + (r.gross_pay || 0), 0);
    const allEntries = await base44.asServiceRole.entities.PayrollEntry.filter({ pay_period_id });
    const totalNet = allEntries.reduce((s, e) => s + (e.net_pay || 0), 0);
    const totalDed = allEntries.reduce((s, e) => s + (e.total_deductions || 0), 0);
    const totalTax = allEntries.reduce((s, e) => s + (e.tax_amount || 0), 0);
    const totalG   = allEntries.reduce((s, e) => s + (e.gross_pay || 0), 0);

    await base44.asServiceRole.entities.PayPeriod.update(pay_period_id, {
      status: 'in_review',
      total_gross: Math.round(totalG * 100) / 100,
      total_deductions: Math.round(totalDed * 100) / 100,
      total_net: Math.round(totalNet * 100) / 100,
      total_tax: Math.round(totalTax * 100) / 100,
      employee_count: allEntries.length,
    });

    // ── Audit log ─────────────────────────────────────────────────────────────
    await base44.asServiceRole.entities.PayrollAuditLog.create({
      pay_period_id,
      pay_period_name: period.name,
      action: 'entries_generated',
      performed_by: user.id,
      performed_by_name: user.full_name,
      timestamp: new Date().toISOString(),
      changes_summary: `Generated ${results.length} payroll entries for period ${period.name}`,
    });

    return Response.json({
      success: true,
      pay_period_id,
      entries_generated: results.length,
      entries: results,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Count working days between two dates (Mon–Fri by default, or 6-day week)
function countWorkingDays(start, end, workingDaysPerWeek = 5) {
  let count = 0;
  const cur = new Date(start);
  // For 5-day week: Mon(1)–Fri(5). For 6-day: Mon(1)–Sat(6).
  const maxDow = workingDaysPerWeek >= 6 ? 6 : 5;
  while (cur <= end) {
    const dow = cur.getDay(); // 0=Sun
    if (dow >= 1 && dow <= maxDow) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}