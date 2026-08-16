-- Keep raw task outputs out of the public leaderboard response. The old
-- suites_json field averages ~40 KB because it includes complete model output;
-- this compact field is sufficient for ranking and detail summaries.
ALTER TABLE runs ADD COLUMN suites_summary_json TEXT NOT NULL DEFAULT '{}';

UPDATE runs
SET suites_summary_json = COALESCE(
  (
    SELECT json_group_object(
      suite.key,
      json_object(
        'score', json_extract(suite.value, '$.score'),
        'pass_count', json_extract(suite.value, '$.pass_count'),
        'task_count', json_extract(suite.value, '$.task_count')
      )
    )
    FROM json_each(runs.suites_json) AS suite
  ),
  '{}'
);

CREATE INDEX IF NOT EXISTS idx_runs_model_harness_score
ON runs(model, harness, overall_score DESC, submitted_at DESC);
