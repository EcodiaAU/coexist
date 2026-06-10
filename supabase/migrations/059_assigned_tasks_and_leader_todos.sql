-- 059: Assigned task mode + personal leader to-do list
-- 1. Allow task_templates.assignment_mode to be 'assigned' (specific user)
-- 2. Add assigned_to_user_id on task_templates for the target user
-- 3. Create leader_todos table for personal to-do lists

-- ----------------------------------------------------------------
-- 1. Extend assignment_mode to support 'assigned'
-- ----------------------------------------------------------------
ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN task_templates.assigned_to_user_id IS
  'When assignment_mode = assigned, the specific user this task is for';

-- ----------------------------------------------------------------
-- 2. Personal leader to-do list
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leader_todos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  due_date      date,
  due_time      time,
  priority      text NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed')),
  completed_at  timestamptz,
  -- link to a recommended task template (nullable)
  source_template_id uuid REFERENCES task_templates(id) ON DELETE SET NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leader_todos_user_status
  ON leader_todos(user_id, status);

CREATE INDEX IF NOT EXISTS idx_leader_todos_user_due
  ON leader_todos(user_id, due_date);

-- ----------------------------------------------------------------
-- 3. RLS policies for leader_todos
-- ----------------------------------------------------------------
ALTER TABLE leader_todos ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own todos
CREATE POLICY leader_todos_select ON leader_todos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY leader_todos_insert ON leader_todos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY leader_todos_update ON leader_todos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY leader_todos_delete ON leader_todos
  FOR DELETE USING (auth.uid() = user_id);

-- Admins can view all todos (for oversight)
CREATE POLICY leader_todos_admin_select ON leader_todos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('national_admin', 'super_admin')
    )
  );
