import {
  ForbiddenError,
  can as roleCan,
  type Permission,
  type Role,
  type TenantContext,
} from "@cura/shared";

/**
 * Composable, declarative authorization guards over a {@link TenantContext}.
 * Guards are pure predicates plus `assert*` helpers that throw
 * {@link ForbiddenError} (mapped to 403 by the Phase 06 error handler). No
 * transport concerns here — the same guards protect HTTP handlers and WS
 * messages.
 */

/** Does this context hold the given permission? */
export function hasPermission(ctx: TenantContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}

/** Is this context one of the given roles? */
export function hasRole(ctx: TenantContext, ...roles: Role[]): boolean {
  return roles.includes(ctx.role);
}

/** Throw {@link ForbiddenError} unless the context holds `permission`. */
export function assertPermission(ctx: TenantContext, permission: Permission): void {
  if (!hasPermission(ctx, permission)) {
    throw new ForbiddenError("You do not have permission to perform this action", {
      details: { required: permission },
    });
  }
}

/** Throw {@link ForbiddenError} unless the context is one of `roles`. */
export function assertRole(ctx: TenantContext, ...roles: Role[]): void {
  if (!hasRole(ctx, ...roles)) {
    throw new ForbiddenError("Your role does not have access to this resource", {
      details: { required: roles },
    });
  }
}

/**
 * A reusable guard bound to a permission: `const guard = requirePermission('notes:sign')`
 * then `guard(ctx)` at any call site (HTTP preHandler, WS handler).
 */
export function requirePermission(permission: Permission): (ctx: TenantContext) => void {
  return (ctx) => assertPermission(ctx, permission);
}

/** A reusable guard bound to one or more roles. */
export function requireRole(...roles: Role[]): (ctx: TenantContext) => void {
  return (ctx) => assertRole(ctx, ...roles);
}

/** Re-export the low-level role↔permission check for convenience. */
export { roleCan as can };
