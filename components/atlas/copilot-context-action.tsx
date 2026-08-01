"use client";

type CopilotContextActionProps = {
  label: string;
  prompt: string;
  context?: Record<string, unknown>;
  className?: string;
};

export function CopilotContextAction({
  label,
  prompt,
  context = {},
  className = "atlas-button-secondary",
}: CopilotContextActionProps) {
  function openCopilot() {
    window.dispatchEvent(
      new CustomEvent("atlas:open-copilot", {
        detail: {
          prompt,
          context: {
            ...context,
            actionMode: "preview-only",
            requiresHumanConfirmation: true,
          },
        },
      }),
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={openCopilot}
      data-copilot-action="preview-only"
      title="O Atlas prepara a recomendação; você confirma qualquer ação"
    >
      {label}
    </button>
  );
}
