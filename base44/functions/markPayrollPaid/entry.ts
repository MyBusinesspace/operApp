import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { requirePermission } from '../../shared/permissions.ts';
import { getNextSequence } from '../../shared/sequence.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Marking a pay period as paid is a payroll approval action.
    const denied = await requirePermission(base44, user, 'payroll', 'can_approve');
    if (denied) return denied;

    const {
      pay_period_id,
      bank_account_id,
      salary_expense_account_id,
      tax_liability_account_id,
      social_insurance_liability_account_id,
      loan_liability_account_id,
      other_deductions_liability_account_id,
    } = await req.json();
    if (!pay_period_id) return Response.json({ error: 'pay_period_id is required' }, { status: 400 });
    if (!bank_account_id) return Response.json({ error: 'bank_account_id is required' }, { status: 400 });
    if (!salary_expense_account_id) return Response.json({ error: 'salary_expense_account_id is required' }, { status: 400 });

    // ── Load pay period ──────────────────────────────────────────────────────
    const periods = await base44.asServiceRole.entities.PayPeriod.filter({ id: pay_period_id });
    const period = Array.isArray(periods) ? periods[0] : null;
    if (!period) return Response.json({ error: 'Pay period not found' }, { status: 404 });
    if (period.status !== 'approved') return Response.json({ error: 'Pay period must be approved before marking as paid' }, { status: 400 });

    // ── Load bank account ────────────────────────────────────────────────────
    const bankAccts = await base44.asServiceRole.entities.BankAccount.filter({ id: bank_account_id });
    const bankAccount = Array.isArray(bankAccts) ? bankAccts[0] : null;
    if (!bankAccount) return Response.json({ error: 'Bank account not found' }, { status: 404 });

    // ── Load expense account ─────────────────────────────────────────────────
    const coaList = await base44.asServiceRole.entities.ChartOfAccount.filter({ id: salary_expense_account_id });
    const expenseAccount = Array.isArray(coaList) ? coaList[0] : null;
    if (!expenseAccount) return Response.json({ error: 'Expense account not found' }, { status: 404 });

    // ── Load payroll entries to compute deduction breakdown ──────────────────
    const payrollEntriesRaw = await base44.asServiceRole.entities.PayrollEntry.filter({ pay_period_id }, '-created_date', 5000);
    const entriesArr = Array.isArray(payrollEntriesRaw) ? payrollEntriesRaw : (payrollEntriesRaw?.items || []);
    const totalGross = entriesArr.reduce((s, e) => s + (e.gross_pay || 0), 0);
    const totalNetPay = entriesArr.reduce((s, e) => s + (e.net_pay || 0), 0);
    const totalTax = entriesArr.reduce((s, e) => s + (e.tax_amount || 0), 0);
    const totalSocialInsurance = entriesArr.reduce((s, e) => s + (e.social_insurance_deduction || 0), 0);
    const totalLoan = entriesArr.reduce((s, e) => s + (e.loan_deduction || 0), 0);
    const totalOtherDeductions = entriesArr.reduce((s, e) =>
      s + (e.absence_deduction || 0) + (e.late_deduction || 0) + (e.other_deductions || 0), 0);

    // Validate liability accounts are provided when the corresponding total > 0
    if (totalTax > 0 && !tax_liability_account_id) {
      return Response.json({ error: 'Tax liability account is required (tax deductions exist for this period)' }, { status: 400 });
    }
    if (totalSocialInsurance > 0 && !social_insurance_liability_account_id) {
      return Response.json({ error: 'Social insurance liability account is required (social insurance deductions exist for this period)' }, { status: 400 });
    }
    if (totalLoan > 0 && !loan_liability_account_id) {
      return Response.json({ error: 'Loan liability account is required (loan deductions exist for this period)' }, { status: 400 });
    }
    if (totalOtherDeductions > 0 && !other_deductions_liability_account_id) {
      return Response.json({ error: 'Other deductions liability account is required (absence/late/other deductions exist for this period)' }, { status: 400 });
    }

    // ── Load liability accounts (only for non-zero totals) ───────────────────
    const liabilitySpecs = [
      { id: tax_liability_account_id, amount: totalTax, label: 'Tax' },
      { id: social_insurance_liability_account_id, amount: totalSocialInsurance, label: 'Social Insurance' },
      { id: loan_liability_account_id, amount: totalLoan, label: 'Loan/Advance' },
      { id: other_deductions_liability_account_id, amount: totalOtherDeductions, label: 'Other Deductions' },
    ].filter(la => la.amount > 0 && la.id);

    const liabilityAccounts: any[] = [];
    for (const la of liabilitySpecs) {
      const accts = await base44.asServiceRole.entities.ChartOfAccount.filter({ id: la.id });
      const acct = Array.isArray(accts) ? accts[0] : null;
      if (!acct) return Response.json({ error: `${la.label} liability account not found` }, { status: 404 });
      liabilityAccounts.push({ ...la, account: acct });
    }

    // ── Generate journal entry number (atomic sequence) ───────────────────────
    const jnlNumber = await getNextSequence(base44, 'JNL');
    const today = new Date().toISOString().slice(0, 10);
    const nowISO = new Date().toISOString();

    const netAmount = totalNetPay || period.total_net || 0;
    const grossAmount = totalGross || period.total_gross || 0;

    // ── Create Journal Entry ─────────────────────────────────────────────────
    // DR: Salary/Wages Expense (GROSS pay — full cost to the company)
    // CR: Bank Account (NET pay — cash actually going out)
    // CR: Liability accounts for each deduction type (tax, social insurance, loans, other)
    const lines: any[] = [
      {
        account_id: expenseAccount.id,
        account_code: expenseAccount.code || '',
        account_name: expenseAccount.name,
        description: `Payroll - ${period.name} - Gross salary`,
        debit: grossAmount,
        credit: 0,
      },
      {
        account_id: bankAccount.chart_account_id || '',
        account_code: bankAccount.chart_account_code || '',
        account_name: bankAccount.chart_account_name || bankAccount.name,
        description: `Payroll - ${period.name} - Bank payment (net)`,
        debit: 0,
        credit: netAmount,
      },
    ];

    for (const la of liabilityAccounts) {
      lines.push({
        account_id: la.account.id,
        account_code: la.account.code || '',
        account_name: la.account.name,
        description: `Payroll - ${period.name} - ${la.label} liability`,
        debit: 0,
        credit: la.amount,
      });
    }

    const journalEntry = await base44.asServiceRole.entities.JournalEntry.create({
      number: jnlNumber,
      date: today,
      narration: `Payroll ${period.name} — Gross AED ${grossAmount.toFixed(2)} · Net AED ${netAmount.toFixed(2)} paid via ${bankAccount.name}`,
      reference: period.name,
      source_type: 'Payroll',
      source_id: pay_period_id,
      source_number: period.name,
      status: 'Posted',
      posted_date: today,
      currency: bankAccount.currency || 'AED',
      lines,
      total_debit: grossAmount,
      total_credit: grossAmount,
    });

    // ── Create Bank Transaction ──────────────────────────────────────────────
    const bankTxn = await base44.asServiceRole.entities.BankTransaction.create({
      bank_account_id: bankAccount.id,
      bank_account_name: bankAccount.name,
      date: today,
      description: `Payroll — ${period.name} — ${period.employee_count || 0} employees`,
      reference: jnlNumber,
      type: 'Spend Money',
      amount: netAmount,
      currency: bankAccount.currency || 'AED',
      account_id: expenseAccount.id,
      account_code: expenseAccount.code || '',
      account_name: expenseAccount.name,
      status: 'Unreconciled',
      source_type: 'Payroll',
      source_id: pay_period_id,
      source_number: period.name,
      journal_entry_id: journalEntry.id,
      notes: `Net pay for pay period ${period.name}. Journal entry: ${jnlNumber}`,
    });

    // ── Update PayPeriod to paid ─────────────────────────────────────────────
    await base44.asServiceRole.entities.PayPeriod.update(pay_period_id, {
      status: 'paid',
      paid_at: nowISO,
    });

    // ── Update all PayrollEntries to paid ────────────────────────────────────
    const entriesPage = await base44.asServiceRole.entities.PayrollEntry.filter({ pay_period_id }, '-created_date', 5000);
    const entries = Array.isArray(entriesPage) ? entriesPage : (entriesPage?.items || []);
    for (const entry of entries) {
      if (entry.status === 'approved' || entry.status === 'reviewed') {
        await base44.asServiceRole.entities.PayrollEntry.update(entry.id, { status: 'paid' });
      }
    }

    // ── Decrement loan balances now that the period is paid (once per paid period) ──
    const activeLoans = await base44.asServiceRole.entities.EmployeeLoan.filter({ status: 'active' }, '-created_date', 5000);
    for (const entry of entries) {
      if (!(entry.loan_deduction > 0)) continue;
      for (const loan of activeLoans.filter(l => l.employee_id === entry.employee_id)) {
        const deduction = loan.monthly_deduction || 0;
        if (deduction <= 0) continue;
        const newBalance = Math.max(0, (loan.remaining_balance || 0) - deduction);
        const patch: any = { remaining_balance: newBalance };
        if (newBalance <= 0) patch.status = 'paid_off';
        try { await base44.asServiceRole.entities.EmployeeLoan.update(loan.id, patch); } catch {}
      }
    }

    // ── Audit logs ───────────────────────────────────────────────────────────
    await base44.asServiceRole.entities.PayrollAuditLog.create({
      pay_period_id,
      pay_period_name: period.name,
      action: 'period_paid',
      performed_by: user.id,
      performed_by_name: user.full_name,
      timestamp: nowISO,
      changes_summary: `Payroll marked as paid. Gross AED ${grossAmount.toFixed(2)} expensed, Net AED ${netAmount.toFixed(2)} debited from ${bankAccount.name}. Journal entry: ${jnlNumber}.`,
      new_values: {
        bank_account_id: bankAccount.id,
        bank_account_name: bankAccount.name,
        journal_entry_id: journalEntry.id,
        journal_entry_number: jnlNumber,
        bank_transaction_id: bankTxn.id,
        gross_amount: grossAmount,
        net_amount: netAmount,
        total_tax: totalTax,
        total_social_insurance: totalSocialInsurance,
        total_loan: totalLoan,
        total_other_deductions: totalOtherDeductions,
      },
    });

    return Response.json({
      success: true,
      pay_period_id,
      journal_entry_id: journalEntry.id,
      journal_entry_number: jnlNumber,
      bank_transaction_id: bankTxn.id,
      gross_amount: grossAmount,
      net_amount: netAmount,
      bank_account_name: bankAccount.name,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});