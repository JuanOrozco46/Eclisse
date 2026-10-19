import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Fase 3: Supabase RLS Policies & Security Verification', () => {
  const fase0Sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20261009_fase0_security_hardening.sql'),
    'utf-8'
  );
  const fase1Sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20261009_fase1_order_reliability.sql'),
    'utf-8'
  );
  const fase3Sql = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20261009_fase3_rls_hardening.sql'),
    'utf-8'
  );

  const combinedSql = `${fase0Sql}\n${fase1Sql}\n${fase3Sql}`;
  const normalizedSql = combinedSql.replace(/\s+/g, ' ');

  it('enforces ROW LEVEL SECURITY on all critical tables', () => {
    const requiredRlsTables = [
      'menu_items',
      'orders',
      'ingredients',
      'profiles',
      'transactions',
      'rappi_config',
      'bot_conversations',
      'bot_events',
    ];

    for (const table of requiredRlsTables) {
      const regex = new RegExp(`ALTER TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
      expect(
        regex.test(combinedSql),
        `Table public.${table} must have ENABLE ROW LEVEL SECURITY defined`
      ).toBe(true);
    }
  });

  it('revokes public / anon write and read access to orders', () => {
    expect(normalizedSql).toContain('DROP POLICY IF EXISTS "Permitir todas las operaciones en orders" ON public.orders');
    expect(normalizedSql).toMatch(/CREATE POLICY "orders_select_staff" ON public\.orders\s+FOR SELECT/);
    expect(normalizedSql).toMatch(/CREATE POLICY "orders_insert_staff" ON public\.orders\s+FOR INSERT/);
    expect(normalizedSql).toMatch(/CREATE POLICY "orders_update_staff" ON public\.orders\s+FOR UPDATE/);
    expect(normalizedSql).toMatch(/CREATE POLICY "orders_delete_admin" ON public\.orders\s+FOR DELETE/);
  });

  it('prevents WAITER and KITCHEN from deleting orders (ADMIN only)', () => {
    const deleteOrderMatch = normalizedSql.match(/CREATE POLICY "orders_delete_admin" ON public\.orders FOR DELETE TO authenticated USING \(([\s\S]+?)\);/i);
    expect(deleteOrderMatch).not.toBeNull();
    const condition = deleteOrderMatch![1];
    expect(condition).toContain("public.has_any_role(ARRAY['ADMIN']::TEXT[])");
  });

  it('restricts orders UPDATE to KITCHEN, WAITER, and ADMIN, but disallows KITCHEN from INSERT', () => {
    expect(normalizedSql).toContain(
      "CREATE POLICY \"orders_update_staff\" ON public.orders FOR UPDATE TO authenticated USING (public.has_any_role(ARRAY['ADMIN', 'WAITER', 'KITCHEN']::TEXT[]))"
    );

    expect(normalizedSql).toContain(
      "CREATE POLICY \"orders_insert_staff\" ON public.orders FOR INSERT TO authenticated WITH CHECK (public.has_any_role(ARRAY['ADMIN', 'WAITER']::TEXT[]))"
    );
  });

  it('secures transactions so only ADMIN can read and write sales and expenses', () => {
    expect(normalizedSql).toMatch(/CREATE POLICY "transactions_select_admin" ON public\.transactions FOR SELECT/);
    expect(normalizedSql).toMatch(/CREATE POLICY "transactions_modify_admin" ON public\.transactions FOR ALL/);

    const txMatch = normalizedSql.match(/CREATE POLICY "transactions_select_admin" ON public\.transactions FOR SELECT TO authenticated USING \(([\s\S]+?)\);/i);
    expect(txMatch).not.toBeNull();
    expect(txMatch![1]).toContain("public.has_any_role(ARRAY['ADMIN']::TEXT[])");
  });

  it('restricts bot_events so only ADMIN can inspect funnel telemetry', () => {
    expect(normalizedSql).toMatch(/CREATE POLICY "bot_events_select_admin" ON public\.bot_events FOR SELECT/);
    const botEventsMatch = normalizedSql.match(/CREATE POLICY "bot_events_select_admin" ON public\.bot_events FOR SELECT TO authenticated USING \(([\s\S]+?)\);/i);
    expect(botEventsMatch).not.toBeNull();
    expect(botEventsMatch![1]).toContain("public.has_any_role(ARRAY['ADMIN']::TEXT[])");
  });

  it('keeps public menu_items readable for anonymous website visitors', () => {
    expect(normalizedSql).toMatch(/CREATE POLICY "menu_items_select_public" ON public\.menu_items FOR SELECT USING \(true\)/);
  });
});
