import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://mxwrhotuyikqsxudopvm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14d3Job3R1eWlrcXN4dWRvcHZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MTM2NzUsImV4cCI6MjA5MjQ4OTY3NX0.90SkfhqLqHZOmAX4XkcL4lm2fCQLJmTcD47oZ_TQ_CA'
)

export const TENANT_SLUG: string = import.meta.env.VITE_TENANT_SLUG ?? 'ftth'
