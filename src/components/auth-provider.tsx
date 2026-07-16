import { type ReactNode } from 'react'
import { AuthContext, useAuthProvider } from '@/hooks/use-auth'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useAuthProvider()

  return (
    <AuthContext.Provider data-eos-id="src/components/auth-provider.tsx#0" data-eos-v="2" value={auth}>
      {children}
    </AuthContext.Provider>
  )
}
