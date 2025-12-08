// backend/controllers/employeeController.js
import pool from "../config/db.js";

/* ---------------------------------------------------------
   GET ALL EMPLOYEES
   Supports:
     includeInactive=true
--------------------------------------------------------- */
export const listEmployees = async (req, res) => {
  try {
    const includeInactive =
      req.query.includeInactive === "true" ||
      req.query.includeInactive === true;

    const query = includeInactive
      ? `
        SELECT 
          id,
          first_name,
          last_name,
          email,
          job_title,
          department,
          location,
          status,
          is_active
        FROM employees
        ORDER BY last_name ASC, first_name ASC
      `
      : `
        SELECT 
          id,
          first_name,
          last_name,
          email,
          job_title,
          department,
          location,
          status,
          is_active
        FROM employees
        WHERE is_active = TRUE
        ORDER BY last_name ASC, first_name ASC
      `;

    const result = await pool.query(query);

    const employees = result.rows.map((e) => ({
      ...e,
      full_name: `${e.first_name} ${e.last_name}`,
    }));

    res.json(employees);
  } catch (err) {
    console.error("listEmployees error:", err);
    res.status(500).json({ error: "Failed to load employees" });
  }
};

/* ---------------------------------------------------------
   GET SINGLE EMPLOYEE
--------------------------------------------------------- */
export const getEmployee = async (req, res) => {
  try {
    const id = req.params.id;

    const result = await pool.query(
      `
      SELECT 
        id,
        first_name,
        last_name,
        email,
        job_title,
        department,
        location,
        status,
        is_active
      FROM employees
      WHERE id=$1
      `,
      [id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Employee not found" });

    const emp = result.rows[0];

    res.json({
      ...emp,
      full_name: `${emp.first_name} ${emp.last_name}`,
    });
  } catch (err) {
    console.error("getEmployee error:", err);
    res.status(500).json({ error: "Failed to fetch employee" });
  }
};

/* ---------------------------------------------------------
   CREATE EMPLOYEE
--------------------------------------------------------- */
export const createEmployee = async (req, res) => {
  try {
    const { first_name, last_name, email, job_title, department, location } =
      req.body;

    if (!first_name || !last_name || !email) {
      return res.status(400).json({
        error: "first_name, last_name and email are required",
      });
    }

    // Insert into status (is_active is generated from status)
    const result = await pool.query(
      `
      INSERT INTO employees (
        first_name,
        last_name,
        email,
        job_title,
        department,
        location,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'Active')
      RETURNING 
        id,
        first_name,
        last_name,
        email,
        job_title,
        department,
        location,
        status,
        is_active
      `,
      [
        first_name.trim(),
        last_name.trim(),
        email.trim(),
        job_title || null,
        department || null,
        location || null,
      ]
    );

    const emp = result.rows[0];

    res.status(201).json({
      ...emp,
      full_name: `${emp.first_name} ${emp.last_name}`,
    });
  } catch (err) {
    console.error("createEmployee error:", err);
    res.status(500).json({ error: "Failed to create employee" });
  }
};

/* ---------------------------------------------------------
   UPDATE EMPLOYEE
--------------------------------------------------------- */
export const updateEmployee = async (req, res) => {
  try {
    const id = req.params.id;
    const {
      first_name,
      last_name,
      email,
      job_title,
      department,
      location,
      is_active,
    } = req.body;

    // Map boolean is_active → status text column
    const status = is_active === false ? "Inactive" : "Active";

    const result = await pool.query(
      `
      UPDATE employees
      SET 
        first_name=$1,
        last_name=$2,
        email=$3,
        job_title=$4,
        department=$5,
        location=$6,
        status=$7
      WHERE id=$8
      RETURNING 
        id,
        first_name,
        last_name,
        email,
        job_title,
        department,
        location,
        status,
        is_active
      `,
      [
        first_name,
        last_name,
        email,
        job_title || null,
        department || null,
        location || null,
        status,
        id,
      ]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Employee not found" });

    const emp = result.rows[0];

    res.json({
      ...emp,
      full_name: `${emp.first_name} ${emp.last_name}`,
    });
  } catch (err) {
    console.error("updateEmployee error:", err);
    res.status(500).json({ error: "Failed to update employee" });
  }
};

/* ---------------------------------------------------------
   DELETE EMPLOYEE
--------------------------------------------------------- */
export const deleteEmployee = async (req, res) => {
  try {
    const id = req.params.id;

    await pool.query(`DELETE FROM employees WHERE id=$1`, [id]);

    res.json({ success: true });
  } catch (err) {
    console.error("deleteEmployee error:", err);
    res.status(500).json({ error: "Failed to delete employee" });
  }
};
