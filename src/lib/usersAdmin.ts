import "server-only";

import { listAuthorizedUsersMysql } from "./userDirectory";

export async function listAuthorizedUsersAdmin() {
  return listAuthorizedUsersMysql();
}
