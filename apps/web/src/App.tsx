import { Component, lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router";
import { useClaude } from "./api/claude";
import { AppShell } from "./components/AppShell";
import { Banner } from "./components/Banner";
import { Button } from "./components/Button";
import { EmptyState } from "./components/EmptyState";
import { DictatePage } from "./pages/DictatePage";
import { ItemFormPage } from "./pages/ItemFormPage";
import { ItemsPage } from "./pages/ItemsPage";
import { OrganisePage } from "./pages/OrganisePage";
import { SpacePage } from "./pages/SpacePage";
import { TagsPage } from "./pages/TagsPage";

// The component catalogue is dev-only; this branch is dropped from production builds.
const ComponentsPage = import.meta.env.DEV ? lazy(() => import("./dev/ComponentsPage")) : null;

export function App() {
  // Fetched once up front, so the Dictate and Organise buttons are already
  // there when a screen opens rather than pushing its content down.
  useClaude();
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<ItemsPage />} />
        <Route path="/items/new" element={<ItemFormPage />} />
        <Route path="/items/dictate" element={<DictatePage />} />
        <Route path="/items/:id" element={<ItemFormPage />} />
        <Route path="/organise" element={<OrganisePage />} />
        <Route path="/space" element={<SpacePage />} />
        <Route path="/tags" element={<TagsPage />} />
        {ComponentsPage && (
          <Route path="/dev/components" element={<Suspense><ComponentsPage /></Suspense>} />
        )}
        <Route path="*" element={
          <AppShell><EmptyState title="Page not found" action={<Button to="/">Go to items</Button>} /></AppShell>
        } />
      </Routes>
    </ErrorBoundary>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <AppShell nav={false}>
        <Banner action={<Button onClick={() => location.reload()}>Reload</Button>}>Something went wrong: {this.state.error.message}</Banner>
      </AppShell>
    );
  }
}
