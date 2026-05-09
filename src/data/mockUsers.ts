export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Reviewer" | "Source Manager" | "Observer";
  status: "active" | "invited" | "suspended";
  lastActive: string;
};

export const mockUsers: AdminUser[] = [];
