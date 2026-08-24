-- handle_new_user est une fonction trigger (SECURITY DEFINER) : elle ne doit
-- être invocable que par le trigger lui-même (sur INSERT into auth.users),
-- jamais exposée en RPC public via /rest/v1/rpc/handle_new_user.
--
-- Le privilège EXECUTE est accordé par défaut au pseudo-rôle PUBLIC (dont
-- anon/authenticated héritent) — le retirer ne casse pas le trigger : son
-- déclenchement par le serveur ne dépend pas de ce privilège.
revoke execute on function public.handle_new_user() from public;
