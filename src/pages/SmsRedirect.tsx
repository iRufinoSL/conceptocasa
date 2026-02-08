import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";

/**
 * Lightweight redirect page for SMS deep links.
 * Routes like /r/email/:id or /r/task/:id are short, clean URLs
 * without query params — making them reliably clickable in SMS messages.
 */
const SmsRedirect = () => {
  const { type, id } = useParams<{ type: string; id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (!type || !id) {
      navigate("/dashboard", { replace: true });
      return;
    }

    switch (type) {
      case "email":
        navigate(`/crm?tab=comunicaciones&email=${id}`, { replace: true });
        break;
      case "task": {
        const budgetId = searchParams.get("b");
        if (budgetId) {
          navigate(`/presupuestos/${budgetId}?tab=agenda&task=${id}`, { replace: true });
        } else {
          navigate(`/agenda?task=${id}`, { replace: true });
        }
        break;
      }
      case "budget":
        navigate(`/presupuestos/${id}?tab=comunicaciones`, { replace: true });
        break;
      case "crm":
        navigate(`/crm?tab=${id}`, { replace: true });
        break;
      default:
        navigate("/dashboard", { replace: true });
    }
  }, [type, id, navigate, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <p className="text-muted-foreground animate-pulse">Redirigiendo…</p>
    </div>
  );
};

export default SmsRedirect;
