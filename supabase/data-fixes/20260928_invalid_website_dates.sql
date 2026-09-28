-- Flag exactly two untouched, unassigned website appointments with year 8250.
-- Retain both leads/jobs and the original dates. Do not guess a replacement date.
-- Run once after deploying website-lead-webhook's date validation. Clear the
-- appointment dates through the signed-in Owner job editor, preserving its
-- permission checks and audit history. This script does not change scheduling.
-- To rehearse safely, replace the final COMMIT with ROLLBACK.
BEGIN;
SET LOCAL ROLE service_role;
DO $repair$
DECLARE
  job_ids text[] := ARRAY['job_web_2400cf72-b922-4be5-99a3-ce8034389a9c','job_web_6ad9e057-8bbe-4c62-b6bb-488ff26a7d5e'];
  lead_ids text[] := ARRAY['lead_web_bddeed59-22e8-4a83-949c-ff4ae0ab9f73','lead_web_33b7241f-29ff-4aeb-a5da-cf853eb97310'];
  changed integer;
BEGIN
  PERFORM 1 FROM public.jobs WHERE id=ANY(job_ids) FOR UPDATE;
  PERFORM 1 FROM public.leads WHERE id=ANY(lead_ids) FOR UPDATE;
  UPDATE public.jobs j
  SET app_data=coalesce(app_data,'{}'::jsonb)||jsonb_build_object(
        'date_needs_review',true,'original_scheduled_date',scheduled_date,
        'original_schedule_status',status,'date_repaired_at',now(),
        'date_repair_reason','Invalid website date; confirm with customer before scheduling')
  WHERE id=ANY(job_ids) AND scheduled_date='8250-02-26'::date
    AND status='scheduled' AND row_version=1 AND deleted_at IS NULL
    AND technician_id IS NULL AND customer_id IS NULL AND workflow_version=0
    AND app_data->>'source'='website_form' AND app_data->>'lead_id'=ANY(lead_ids)
    AND NOT EXISTS(SELECT 1 FROM public.invoices i WHERE i.job_id=j.id);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>2 THEN RAISE EXCEPTION 'Reviewed website jobs changed; abort repair (matched %)',changed; END IF;
  UPDATE public.leads
  SET app_data=coalesce(app_data,'{}'::jsonb)||jsonb_build_object(
    'preferred_date',NULL,'preferred_date_input','8250-02-26',
    'date_needs_review',true,'date_repaired_at',now())
  WHERE id=ANY(lead_ids) AND converted_job_id IS NULL AND row_version=1
    AND deleted_at IS NULL AND app_data->>'preferred_date'='8250-02-26';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>2 THEN RAISE EXCEPTION 'Reviewed website leads changed; abort repair (matched %)',changed; END IF;
  IF public.service_ensure_website_appointment(lead_ids[1])<>job_ids[1]
     OR public.service_ensure_website_appointment(lead_ids[2])<>job_ids[2]
  THEN RAISE EXCEPTION 'Original website job link changed; abort repair';END IF;
  INSERT INTO public.ai_alerts(rule_key,severity,title,detail,related_type,related_id,status,evidence)
  SELECT 'website_date_needs_review','warning','Website request — confirm appointment date',
    'An invalid website appointment date needs correction. The original date is preserved; confirm the visit date before scheduling.',
    'lead',id,'open',jsonb_build_object('lead_id',id,'job_id',converted_job_id,'preferred_date_input','8250-02-26','repair','20260928_invalid_website_dates')
  FROM public.leads WHERE id=ANY(lead_ids);
END;
$repair$;
SELECT count(*) AS flagged_jobs,
       bool_and(app_data->>'date_needs_review'='true' AND app_data->>'original_scheduled_date'='8250-02-26') AS original_dates_preserved
FROM public.jobs WHERE id IN ('job_web_2400cf72-b922-4be5-99a3-ce8034389a9c','job_web_6ad9e057-8bbe-4c62-b6bb-488ff26a7d5e');
COMMIT;
