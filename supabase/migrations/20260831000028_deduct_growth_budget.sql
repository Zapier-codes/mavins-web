CREATE OR REPLACE FUNCTION public.deduct_growth_budget(
  p_campaign_id UUID,
  p_amount_cents INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.campaign_growth_budgets
  SET 
    remaining_cents = GREATEST(0, remaining_cents - p_amount_cents),
    total_spent_cents = total_spent_cents + p_amount_cents,
    updated_at = NOW()
  WHERE campaign_id = p_campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_growth_budget(UUID, INTEGER) TO service_role;
