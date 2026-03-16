// Login layout — passes through to AppShell which hides nav for /login routes
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
