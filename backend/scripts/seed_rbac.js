// backend/scripts/seed_rbac.js
import 'dotenv/config';
import pool from '../config/db.js';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure tables exist (idempotent safety)
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT
      );
      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT
      );
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INT REFERENCES roles(id) ON DELETE CASCADE,
        permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );
    `);

    // Seed permissions
    const perms = [
      { name: 'user:create',      description: 'Create users' },
      { name: 'user:read',        description: 'List/View users' },
      { name: 'user:update',      description: 'Update users' },
      { name: 'user:deactivate',  description: 'Deactivate/reactivate users' },
      { name: 'doc:create',       description: 'Create documents' },
      { name: 'doc:read',         description: 'Read/search documents' },
      { name: 'doc:update',       description: 'Update documents' },
      { name: 'doc:delete',       description: 'Delete documents' },
      { name: 'user:password_reset', description: 'Reset user passwords' },
    ];

    for (const p of perms) {
      await client.query(
        `INSERT INTO permissions (name, description)
         VALUES ($1,$2)
         ON CONFLICT (name) DO NOTHING;`,
        [p.name, p.description || null]
      );
    }

    // Seed roles
    const roles = [
      { name: 'Admin',   description: 'Full access' },
      { name: 'Manager', description: 'Manage docs + read users' },
      { name: 'Clerk',   description: 'Basic document operations' },
    ];
    for (const r of roles) {
      await client.query(
        `INSERT INTO roles (name, description)
         VALUES ($1,$2)
         ON CONFLICT (name) DO NOTHING;`,
        [r.name, r.description || null]
      );
    }

    // Map role → permissions
    const rolePerms = {
      Admin: [
        'user:create',
        'user:read',
        'user:update',
        'user:deactivate',
        'user:password_reset',
        'doc:create',
        'doc:read',
        'doc:update',
        'doc:delete',
      ],
      Manager: ['doc:create', 'doc:read', 'doc:update'],
      Clerk: ['doc:read'],
    };

    for (const [roleName, permNames] of Object.entries(rolePerms)) {
      const roleRes = await client.query(
        `SELECT id FROM roles WHERE name=$1`,
        [roleName]
      );
      const roleId = roleRes.rows[0]?.id;
      if (!roleId) continue;

      for (const pn of permNames) {
        const permRes = await client.query(
          `SELECT id FROM permissions WHERE name=$1`,
          [pn]
        );
        const permId = permRes.rows[0]?.id;
        if (!permId) continue;

        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1,$2)
           ON CONFLICT DO NOTHING;`,
          [roleId, permId]
        );
      }
    }

    await client.query('COMMIT');
    console.log('RBAC seed complete ✅');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('RBAC seed failed ❌', err);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

run();
