import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DevCategory = 'learning' | 'leadership_development' | 'onboarding'
export type DevModuleStatus = 'draft' | 'published' | 'archived'
export type DevContentType = 'text' | 'video' | 'file' | 'slideshow' | 'quiz'
export type DevQuestionType = 'multiple_choice' | 'multi_select' | 'true_false' | 'short_answer'

export type DevTargetRole = 'leader' | 'co_leader' | 'assist_leader' | 'national_leader'

export const TARGET_ROLE_OPTIONS: { value: DevTargetRole; label: string }[] = [
  { value: 'leader', label: 'Leaders' },
  { value: 'co_leader', label: 'Co-Leaders' },
  { value: 'assist_leader', label: 'Assistant Leaders' },
  { value: 'national_leader', label: 'National Leader' },
]

export interface DevModule {
  id: string
  title: string
  description: string | null
  category: DevCategory
  thumbnail_url: string | null
  estimated_minutes: number
  status: DevModuleStatus
  pass_score: number | null
  target_roles: string[]
  target_user_ids: string[]
  created_by: string
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface DevModuleContent {
  id: string
  module_id: string
  sort_order: number
  content_type: DevContentType
  text_content: string | null
  video_url: string | null
  video_provider: 'youtube' | 'vimeo' | 'upload' | null
  file_url: string | null
  file_name: string | null
  file_size_bytes: number | null
  image_urls: string[]
  image_captions: string[]
  quiz_id: string | null
  title: string | null
  created_at: string
  updated_at: string
}

export interface DevSection {
  id: string
  title: string
  description: string | null
  category: DevCategory
  thumbnail_url: string | null
  status: DevModuleStatus
  prerequisite_section_id: string | null
  target_roles: string[]
  target_user_ids: string[]
  created_by: string
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface DevSectionModule {
  id: string
  section_id: string
  module_id: string
  sort_order: number
  is_required: boolean
  module?: DevModule
}

export interface DevQuiz {
  id: string
  title: string
  description: string | null
  pass_score: number
  randomize_questions: boolean
  time_limit_minutes: number | null
  max_attempts: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface DevQuizQuestion {
  id: string
  quiz_id: string
  sort_order: number
  question_type: DevQuestionType
  question_text: string
  explanation: string | null
  points: number
  image_url: string | null
  created_at: string
  options?: DevQuizOption[]
}

export interface DevQuizOption {
  id: string
  question_id: string
  sort_order: number
  option_text: string
  is_correct: boolean
}

/* ------------------------------------------------------------------ */
/*  Content block input (for create/update)                            */
/* ------------------------------------------------------------------ */

export interface ContentBlockInput {
  id?: string
  content_type: DevContentType
  sort_order: number
  title?: string | null
  text_content?: string | null
  video_url?: string | null
  video_provider?: 'youtube' | 'vimeo' | 'upload' | null
  file_url?: string | null
  file_name?: string | null
  file_size_bytes?: number | null
  image_urls?: string[]
  image_captions?: string[]
  quiz_id?: string | null
}

export interface QuizQuestionInput {
  id?: string
  question_type: DevQuestionType
  question_text: string
  explanation?: string | null
  points?: number
  image_url?: string | null
  sort_order: number
  options?: { id?: string; option_text: string; is_correct: boolean; sort_order: number }[]
}

/* ------------------------------------------------------------------ */
/*  Query keys                                                         */
/* ------------------------------------------------------------------ */

const keys = {
  modules: ['dev-modules'] as const,
  module: (id: string) => ['dev-modules', id] as const,
  moduleContent: (id: string) => ['dev-module-content', id] as const,
  sections: ['dev-sections'] as const,
  section: (id: string) => ['dev-sections', id] as const,
  sectionModules: (id: string) => ['dev-section-modules', id] as const,
  allSectionModules: ['dev-section-modules-all'] as const,
  quizzes: ['dev-quizzes'] as const,
  quiz: (id: string) => ['dev-quizzes', id] as const,
  quizQuestions: (id: string) => ['dev-quiz-questions', id] as const,
  stats: ['dev-stats'] as const,
}

/* ------------------------------------------------------------------ */
/*  Modules                                                            */
/* ------------------------------------------------------------------ */

export function useDevModules() {
  return useQuery({
    queryKey: keys.modules,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_modules')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as DevModule[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useDevModule(id: string | undefined) {
  return useQuery({
    queryKey: keys.module(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_modules')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as DevModule
    },
    enabled: !!id,
  })
}

export function useDevModuleContent(moduleId: string | undefined) {
  return useQuery({
    queryKey: keys.moduleContent(moduleId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_module_content')
        .select('*')
        .eq('module_id', moduleId!)
        .order('sort_order')
      if (error) throw error
      return data as DevModuleContent[]
    },
    enabled: !!moduleId,
  })
}

export function useCreateModule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      description?: string
      category: DevCategory
      thumbnail_url?: string
      estimated_minutes?: number
      status?: DevModuleStatus
      pass_score?: number | null
      target_roles?: string[]
      target_user_ids?: string[]
      created_by: string
    }) => {
      const { data, error } = await supabase
        .from('dev_modules')
        .insert({
          ...input,
          target_roles: input.target_roles ?? [],
          target_user_ids: input.target_user_ids ?? [],
          published_at: input.status === 'published' ? new Date().toISOString() : null,
        })
        .select()
        .single()
      if (error) throw error
      return data as DevModule
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.modules })
      qc.invalidateQueries({ queryKey: keys.stats })
    },
  })
}

export function useUpdateModule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<DevModule> & { id: string }) => {
      const updates: Record<string, unknown> = { ...input }
      if (input.status === 'published' && !input.published_at) {
        updates.published_at = new Date().toISOString()
      }
      const { data, error } = await supabase
        .from('dev_modules')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as DevModule
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.modules })
      qc.invalidateQueries({ queryKey: keys.module(vars.id) })
      qc.invalidateQueries({ queryKey: keys.stats })
    },
  })
}

export function useDeleteModule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dev_modules').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.modules })
      qc.invalidateQueries({ queryKey: keys.stats })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Content blocks                                                     */
/* ------------------------------------------------------------------ */

export function useSaveModuleContent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      moduleId,
      blocks,
    }: {
      moduleId: string
      blocks: ContentBlockInput[]
    }) => {
      // Delete existing blocks, then insert new ones (simple replace strategy)
      const { error: delError } = await supabase
        .from('dev_module_content')
        .delete()
        .eq('module_id', moduleId)
      if (delError) throw delError

      if (blocks.length === 0) return []

      const rows = blocks.map((b, i) => ({
        module_id: moduleId,
        sort_order: i,
        content_type: b.content_type,
        title: b.title ?? null,
        text_content: b.text_content ?? null,
        video_url: b.video_url ?? null,
        video_provider: b.video_provider ?? null,
        file_url: b.file_url ?? null,
        file_name: b.file_name ?? null,
        file_size_bytes: b.file_size_bytes ?? null,
        image_urls: b.image_urls ?? [],
        image_captions: b.image_captions ?? [],
        quiz_id: b.quiz_id ?? null,
      }))

      const { data, error } = await supabase
        .from('dev_module_content')
        .insert(rows)
        .select()
      if (error) throw error
      return data as DevModuleContent[]
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.moduleContent(vars.moduleId) })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

export function useDevSections() {
  return useQuery({
    queryKey: keys.sections,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_sections')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as DevSection[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useDevSection(id: string | undefined) {
  return useQuery({
    queryKey: keys.section(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_sections')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as DevSection
    },
    enabled: !!id,
  })
}

export function useDevSectionModules(sectionId: string | undefined) {
  return useQuery({
    queryKey: keys.sectionModules(sectionId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_section_modules')
        .select('*, module:dev_modules(*)')
        .eq('section_id', sectionId!)
        .order('sort_order')
      if (error) throw error
      return data as DevSectionModule[]
    },
    enabled: !!sectionId,
  })
}

export function useAllSectionModules() {
  return useQuery({
    queryKey: keys.allSectionModules,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_section_modules')
        .select('*, module:dev_modules(*)')
        .order('sort_order')
      if (error) throw error
      return data as DevSectionModule[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreateSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      description?: string
      category: DevCategory
      thumbnail_url?: string
      status?: DevModuleStatus
      prerequisite_section_id?: string | null
      target_roles?: string[]
      target_user_ids?: string[]
      created_by: string
    }) => {
      const { data, error } = await supabase
        .from('dev_sections')
        .insert({
          ...input,
          target_roles: input.target_roles ?? [],
          target_user_ids: input.target_user_ids ?? [],
          published_at: input.status === 'published' ? new Date().toISOString() : null,
        })
        .select()
        .single()
      if (error) throw error
      return data as DevSection
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.sections })
      qc.invalidateQueries({ queryKey: keys.stats })
    },
  })
}

export function useUpdateSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<DevSection> & { id: string }) => {
      const updates: Record<string, unknown> = { ...input }
      if (input.status === 'published' && !input.published_at) {
        updates.published_at = new Date().toISOString()
      }
      const { data, error } = await supabase
        .from('dev_sections')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as DevSection
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.sections })
      qc.invalidateQueries({ queryKey: keys.section(vars.id) })
      qc.invalidateQueries({ queryKey: keys.stats })
    },
  })
}

export function useDeleteSection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dev_sections').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.sections })
      qc.invalidateQueries({ queryKey: keys.stats })
    },
  })
}

export function useSaveSectionModules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      sectionId,
      modules,
    }: {
      sectionId: string
      modules: { module_id: string; sort_order: number; is_required: boolean }[]
    }) => {
      const { error: delError } = await supabase
        .from('dev_section_modules')
        .delete()
        .eq('section_id', sectionId)
      if (delError) throw delError

      if (modules.length === 0) return []

      const rows = modules.map((m) => ({
        section_id: sectionId,
        module_id: m.module_id,
        sort_order: m.sort_order,
        is_required: m.is_required,
      }))

      const { data, error } = await supabase
        .from('dev_section_modules')
        .insert(rows)
        .select()
      if (error) throw error
      return data
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.sectionModules(vars.sectionId) })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Quizzes                                                            */
/* ------------------------------------------------------------------ */

export function useDevQuizzes() {
  return useQuery({
    queryKey: keys.quizzes,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_quizzes')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as DevQuiz[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useDevQuiz(id: string | undefined) {
  return useQuery({
    queryKey: keys.quiz(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_quizzes')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as DevQuiz
    },
    enabled: !!id,
  })
}

export function useDevQuizQuestions(quizId: string | undefined) {
  return useQuery({
    queryKey: keys.quizQuestions(quizId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_quiz_questions')
        .select('*, options:dev_quiz_options(*)')
        .eq('quiz_id', quizId!)
        .order('sort_order')
      if (error) throw error
      // Sort options within each question
      return (data as DevQuizQuestion[]).map((q) => ({
        ...q,
        options: (q.options ?? []).sort((a, b) => a.sort_order - b.sort_order),
      }))
    },
    enabled: !!quizId,
  })
}

export function useCreateQuiz() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      description?: string
      pass_score?: number
      randomize_questions?: boolean
      time_limit_minutes?: number | null
      max_attempts?: number
      created_by: string
    }) => {
      const { data, error } = await supabase
        .from('dev_quizzes')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as DevQuiz
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.quizzes })
    },
  })
}

export function useUpdateQuiz() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<DevQuiz> & { id: string }) => {
      const { data, error } = await supabase
        .from('dev_quizzes')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as DevQuiz
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.quizzes })
      qc.invalidateQueries({ queryKey: keys.quiz(vars.id) })
    },
  })
}

export function useDeleteQuiz() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dev_quizzes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.quizzes })
    },
  })
}

export function useSaveQuizQuestions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      quizId,
      questions,
    }: {
      quizId: string
      questions: QuizQuestionInput[]
    }) => {
      // Delete existing questions (cascade deletes options)
      const { error: delError } = await supabase
        .from('dev_quiz_questions')
        .delete()
        .eq('quiz_id', quizId)
      if (delError) throw delError

      if (questions.length === 0) return []

      // Insert questions one by one so we can link options
      const results: DevQuizQuestion[] = []
      for (const q of questions) {
        const { data: qData, error: qError } = await supabase
          .from('dev_quiz_questions')
          .insert({
            quiz_id: quizId,
            sort_order: q.sort_order,
            question_type: q.question_type,
            question_text: q.question_text,
            explanation: q.explanation ?? null,
            points: q.points ?? 1,
            image_url: q.image_url ?? null,
          })
          .select()
          .single()
        if (qError) throw qError

        if (q.options && q.options.length > 0) {
          const optionRows = q.options.map((o) => ({
            question_id: qData.id,
            option_text: o.option_text,
            is_correct: o.is_correct,
            sort_order: o.sort_order,
          }))
          const { error: oError } = await supabase
            .from('dev_quiz_options')
            .insert(optionRows)
          if (oError) throw oError
        }

        results.push(qData as DevQuizQuestion)
      }

      return results
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.quizQuestions(vars.quizId) })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Summary stats (for admin dashboard)                                */
/* ------------------------------------------------------------------ */

export function useDevStats() {
  return useQuery({
    queryKey: keys.stats,
    queryFn: async () => {
      const [modulesRes, sectionsRes, quizzesRes] = await Promise.all([
        supabase.from('dev_modules').select('id, status', { count: 'exact' }),
        supabase.from('dev_sections').select('id, status', { count: 'exact' }),
        supabase.from('dev_quizzes').select('id', { count: 'exact' }),
      ])

      const modules = (modulesRes.data ?? []) as Record<string, unknown>[]
      const sections = (sectionsRes.data ?? []) as Record<string, unknown>[]

      return {
        totalModules: modulesRes.count ?? 0,
        publishedModules: modules.filter((m) => m.status === 'published').length,
        draftModules: modules.filter((m) => m.status === 'draft').length,
        totalSections: sectionsRes.count ?? 0,
        publishedSections: sections.filter((s) => s.status === 'published').length,
        totalQuizzes: quizzesRes.count ?? 0,
      }
    },
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Analytics queries                                                  */
/* ------------------------------------------------------------------ */

export function useDevAnalytics() {
  return useQuery({
    queryKey: ['dev-analytics'],
    queryFn: async () => {
      const [progressRes, attemptsRes] = await Promise.all([
        supabase.from('dev_user_module_progress').select('*').limit(5000),
        supabase.from('dev_quiz_attempts').select('*').limit(5000),
      ])

      const progress = (progressRes.data ?? []) as Record<string, unknown>[]
      const attempts = (attemptsRes.data ?? []) as Record<string, unknown>[]

      // Fetch profile display names for all learners
      const userIds = [...new Set([
        ...progress.map((p) => p.user_id as string),
        ...attempts.map((a) => a.user_id as string),
      ])]
      const profileMap = new Map<string, { display_name: string; avatar_url: string | null }>()
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', userIds)
        for (const p of (profiles ?? []) as { id: string; display_name: string; avatar_url: string | null }[]) {
          profileMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url })
        }
      }

      const totalLearners = new Set(progress.map((p) => p.user_id as string)).size
      const completedModules = progress.filter((p) => p.status === 'completed').length
      const avgCompletion = progress.length > 0
        ? Math.round(progress.reduce((sum: number, p) => sum + ((p.progress_pct as number) ?? 0), 0) / progress.length)
        : 0
      const avgQuizScore = attempts.length > 0
        ? Math.round(attempts.reduce((sum: number, a) => sum + (a.score_pct as number), 0) / attempts.length)
        : 0

      return {
        totalLearners,
        completedModules,
        avgCompletion,
        avgQuizScore,
        progress,
        attempts,
        profileMap,
      }
    },
    staleTime: 60 * 1000,
  })
}
