-- Completa registros históricos y refuerza el contrato de auditoría.
-- La misma migración se aplica automáticamente desde core/database.py.
UPDATE audit_logs
SET entity_type = COALESCE(NULLIF(entity_type, ''), 'System'),
    entity_id = COALESCE(NULLIF(entity_id, ''), LEFT('legacy-' || id::text, 36)),
    entity_name = COALESCE(NULLIF(entity_name, ''), INITCAP(REPLACE(action, '_', ' '))),
    detail = CASE
        WHEN detail IS NULL OR detail::jsonb = 'null'::jsonb OR detail::jsonb = '{}'::jsonb
        THEN jsonb_build_object(
            'summary', 'Registro histórico: el sistema anterior no almacenó el detalle',
            'legacy_record', true
        )
        ELSE detail::jsonb
    END;

ALTER TABLE audit_logs ALTER COLUMN entity_type SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN entity_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN entity_name SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN detail SET NOT NULL;

UPDATE audit_logs
SET detail = jsonb_build_object(
    'summary', INITCAP(REPLACE(action, '_', ' ')),
    'legacy_record', true
) || detail::jsonb
WHERE NOT (detail::jsonb ? 'summary')
   OR BTRIM(COALESCE(detail::jsonb ->> 'summary', '')) = '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_audit_logs_detail_object'
    ) THEN
        ALTER TABLE audit_logs ADD CONSTRAINT ck_audit_logs_detail_object
        CHECK (jsonb_typeof(detail::jsonb) = 'object' AND detail::jsonb <> '{}'::jsonb);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_audit_logs_detail_summary'
    ) THEN
        ALTER TABLE audit_logs ADD CONSTRAINT ck_audit_logs_detail_summary
        CHECK (
            detail::jsonb ? 'summary'
            AND BTRIM(COALESCE(detail::jsonb ->> 'summary', '')) <> ''
        );
    END IF;
END $$;
