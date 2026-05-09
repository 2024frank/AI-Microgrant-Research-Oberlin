export type ActivityItem = {
  id: string;
  actor: string;
  action: string;
  target: string;
  time: string;
  severity: "info" | "success" | "warning" | "danger";
};

export const mockActivity: ActivityItem[] = [];
