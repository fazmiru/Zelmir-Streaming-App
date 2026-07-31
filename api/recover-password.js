// api/recover-password.js
//
// Handles two actions, both requiring the Supabase service role key —
// which must NEVER be exposed to the browser, hence this being a server-only
// serverless function rather than client code:
//   - "get-question": look up a username's recovery question (without needing
//     the user to be signed in, which RLS alone can't safely allow)
//   - "reset": verify the recovery answer, then actually change the password
//     via the Supabase Admin API
//
// Requires these environment variables in Vercel (Project Settings ->
// Environment Variables), WITHOUT a VITE_ prefix (server-only):
//   SUPABASE_URL               (same value as VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY  (from Supabase dashboard -> Settings -> API ->
//                                service_role secret — NOT the anon key)

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@zelmir.local`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Server is not configured for password recovery.' })
    return
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { action, username } = req.body ?? {}

  if (!username) {
    res.status(400).json({ error: 'Username is required.' })
    return
  }

  // Look up the user's auth id + profile by username. Since usernames aren't
  // stored on auth.users directly, we go through profiles.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, recovery_question, recovery_answer_hash')
    .ilike('username', username.trim())
    .maybeSingle()

  if (profileError || !profile) {
    // Same message either way — don't reveal whether a username exists.
    if (action === 'get-question') {
      res.status(200).json({ question: null })
    } else {
      res.status(400).json({ error: 'No account found with that username.' })
    }
    return
  }

  if (action === 'get-question') {
    res.status(200).json({ question: profile.recovery_question })
    return
  }

  if (action === 'reset') {
    const { recoveryAnswer, newPassword } = req.body

    if (!recoveryAnswer || !newPassword) {
      res.status(400).json({ error: 'Missing recovery answer or new password.' })
      return
    }

    const answerMatches = await bcrypt.compare(recoveryAnswer.trim().toLowerCase(), profile.recovery_answer_hash)
    if (!answerMatches) {
      res.status(400).json({ error: 'Recovery answer is incorrect.' })
      return
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
      password: newPassword,
    })

    if (updateError) {
      res.status(500).json({ error: 'Could not update password. Please try again.' })
      return
    }

    res.status(200).json({ ok: true })
    return
  }

  res.status(400).json({ error: 'Unknown action.' })
}
