import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import OperaMascot from "@/components/shared/OperaMascot";

export function Toaster() {
  const { toasts } = useToast();
  const visibleToasts = toasts.filter((t) => t.open !== false);
  const latest = visibleToasts[0];

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
      <OperaMascot
        visible={visibleToasts.length > 0}
        message={latest?.description || latest?.title}
        variant={latest?.variant}
      />
    </ToastProvider>
  );
}