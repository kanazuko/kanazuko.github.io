GRANT DELETE ON public.orders TO authenticated;

CREATE POLICY "Admins delete orders" ON public.orders FOR DELETE TO authenticated
USING ((SELECT app_private.is_admin()));

-- Order items are removed by the existing ON DELETE CASCADE foreign key.
