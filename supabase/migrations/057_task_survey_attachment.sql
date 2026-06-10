-- Link task templates to surveys so staff complete a survey when finishing the task
alter table task_templates
  add column survey_id uuid references surveys(id) on delete set null;

comment on column task_templates.survey_id is
  'Optional survey that must be completed when the task is marked done';
