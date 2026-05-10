-- Migration 007: Processing-error count for the activity feed banner.
--
-- The /activity page surfaces a purple "N items couldn't be processed"
-- banner when the classifier pipeline failed for some of the athlete's
-- content. Defining "processing error" in SQL (rather than baking the
-- predicate into the React layer) keeps the wire format stable as the
-- pipeline's failure modes evolve.
--
-- Today's pipeline marks failures in two ways:
--   1. final_risk_level = 'error'   — the new explicit-error path
--   2. final_risk_level = 'none' AND stages_completed = '{}'
--                                   — legacy "pipeline never ran" rows
--
-- After /api/reprocess re-runs an errored item it sets the row to
-- final_risk_level = 'failed' so the count below intentionally excludes
-- 'failed' rows: the user already retried; we don't surface the same
-- banner forever.

CREATE OR REPLACE FUNCTION count_processing_errors()
RETURNS INTEGER
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
    FROM pipeline_runs
   WHERE user_id = current_app_user_id()
     AND (
       final_risk_level = 'error'
       OR (
         final_risk_level = 'none'
         AND (stages_completed IS NULL OR stages_completed = '{}'::TEXT[])
       )
     );
$$;

GRANT EXECUTE ON FUNCTION count_processing_errors() TO authenticated;
