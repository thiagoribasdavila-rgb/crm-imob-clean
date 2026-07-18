export type ShellIdentity = {
  name: string;
  email: string;
  organization: string;
  role: string;
  accessRole: "admin" | "director_decisor" | "director" | "broker";
};

export type DesktopDensity = "compact" | "comfortable";
