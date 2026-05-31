import type { UserContext } from "@mst/shared";

export interface RequestContext {
  request_id: string;
  user: UserContext;
}

export interface AuthContext {
  access_token: string;
  user_id: string;
  email: string | null;
}
