import React, { createContext, useContext, useState, useCallback } from "react";

const AgentPanelContext = createContext(null);

export function AgentPanelProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <AgentPanelContext.Provider value={{ isOpen, toggle, open, close }}>
      {children}
    </AgentPanelContext.Provider>
  );
}

export function useAgentPanel() {
  const ctx = useContext(AgentPanelContext);
  if (!ctx) return { isOpen: false, toggle: () => {}, open: () => {}, close: () => {} };
  return ctx;
}