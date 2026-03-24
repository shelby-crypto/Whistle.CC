/**
 * Root page — redirects authenticated users to their role-specific default view.
 *
 * The middleware skips "/" (to avoid redirect loops), so this page handles
 * its own auth check. Unauthenticated visitors go to /login.
 * Authenticated users go to the default route for their role.
 */

import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';

const DEFAULT_ROUTES: Record<string, string> = {
  ops: '/ops',
  client_success: '/metrics/customers',
  leadership: '/ops',
  research: '/research',
};

export default async function RootPage() {
  const supabase = createSupabaseServer();

  // Check if the user has a valid session
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user?.email) {
    redirect('/login');
  }

  // Look up role from database (same pattern as middleware + callback)
  const { data: userRole } = await supabase
    .from('dashboard_user_roles')
    .select('role, is_active')
    .eq('email', user.email)
    .eq('is_active', true)
    .single();

  if (!userRole) {
    redirect('/login?error=no_access');
  }

  redirect(DEFAULT_ROUTES[userRole.role] || '/ops');
}
