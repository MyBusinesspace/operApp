import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { requirePermission } from '../../shared/permissions.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Marking a pay period as paid is a payroll approval action.
    const denied = await requirePermission(base44, user, 'payroll', 'can_approve');
    if (denied) return denied;

    const { pay_period_id, bank_account_id, salary_expense_account_id } = await req.json();
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

    // ── Generate journal entry number ────────────────────────────────────────
    const allJournals = await base44.asServiceRole.entities.JournalEntry.list();
    const nums = allJournals.map(j => j.number).filter(n => n && n.startsWith('JNL-'));
    const max = nums.length ? Math.max(...nums.map(n => parseInt(n.replace('JNL-', '')) || 0)) : 0;
    const jnlNumber = `JNL-${String(max + 1).padStart(4, '0')}`;
    const today = new Date().toISOString().slice(0, 10);
    const nowISO = new Date().toISOString();

    const amount = period.total_net || 0;

    // ── Create Journal Entry ─────────────────────────────────────────────────
    // DR: Salary/Wages Expense (for the full net pay amount)
    // CR: Bank Account (cash going out)
    const lines = [
      {
        account_id: expenseAccount.id,
        account_code: expenseAccount.code || '',
        account_name: expenseAccount.name,
        description: `Payroll - ${period.name} - Net pay`,
        debit: amount,
        credit: 0,
      },
      {
        account_id: bankAccount.chart_account_id || '',
        account_code: bankAccount.chart_account_code || '',
        account_name: bankAccount.chart_account_name || bankAccount.name,
        description: `Payroll - ${period.name} - Bank payment`,
        debit: 0,
        credit: amount,
      },
    ];

    const journalEntry = await base44.asServiceRole.entities.JournalEntry.create({
      number: jnlNumber,
      date: today,
      narration: `Payroll ${period.name} — AED ${amount.toFixed(2)} paid via ${bankAccount.name}`,
      reference: period.name,
      source_type: 'Payroll',
      source_id: pay_period_id,
      source_number: period.name,
      status: 'Posted',
      posted_date: today,
      currency: bankAccount.currency || 'AED',
      lines,
      total_debit: amount,
      total_credit: amount,
    });

    // ── Create Bank Transaction ──────────────────────────────────────────────
    const bankTxn = await base44.asServiceRole.entities.BankTransaction.create({
      bank_account_id: bankAccount.id,
      bank_account_name: bankAccount.name,
      date: today,
      description: `Payroll — ${period.name} — ${period.employee_count || 0} employees`,
      reference: jnlNumber,
      type: 'Spend Money',
      amount,
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
    const entries = await base44.asServiceRole.entities.PayrollEntry.filter({ pay_period_id });
    for (const entry of entries) {
      if (entry.status === 'approved' || entry.status === 'reviewed') {
        await base44.asServiceRole.entities.PayrollEntry.update(entry.id, { status: 'paid' });
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
      changes_summary: `Payroll marked as paid. AED ${amount.toFixed(2)} debited from ${bankAccount.name}. Journal entry: ${jnlNumber}.`,
      new_values: {
        bank_account_id: bankAccount.id,
        bank_account_name: bankAccount.name,
        journal_entry_id: journalEntry.id,
        journal_entry_number: jnlNumber,
        bank_transaction_id: bankTxn.id,
        amount_paid: amount,
      },
    });

    return Response.json({
      success: true,
      pay_period_id,
      journal_entry_id: journalEntry.id,
      journal_entry_number: jnlNumber,
      bank_transaction_id: bankTxn.id,
      amount_paid: amount,
      bank_account_name: bankAccount.name,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});