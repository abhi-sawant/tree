import { Component, type ReactNode } from "react"
import { createRoot } from "react-dom/client"

import { InstallPrompt } from "~/components/pwa/install-prompt"
import { UpdatePrompt } from "~/components/pwa/update-prompt"

import App from "./app"
import "./app.css"

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <main className="container mx-auto p-4 pt-16">
        <h1>Oops!</h1>
        <p>An unexpected error occurred.</p>
        {import.meta.env.DEV && (
          <pre className="w-full overflow-x-auto p-4">
            <code>{error.stack ?? error.message}</code>
          </pre>
        )}
      </main>
    )
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
    <InstallPrompt />
    <UpdatePrompt />
  </ErrorBoundary>
)
