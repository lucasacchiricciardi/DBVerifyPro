// Test script to verify the DB-Verify system works correctly
const mysql = require('mysql2/promise');
const { Client } = require('pg');

// Mock MySQL connection with simulated classicmodels data
class MockMySQLConnection {
  async execute(query) {
    console.log('Mock MySQL Query:', query);
    
    if (query === "SHOW TABLES") {
      return [[
        { Tables_in_classicmodels: 'customers' },
        { Tables_in_classicmodels: 'employees' }
      ]];
    }
    
    if (query === "SELECT COUNT(*) as count FROM `customers`") {
      return [[{ count: 5 }]];
    }
    
    if (query === "SELECT COUNT(*) as count FROM `employees`") {
      return [[{ count: 5 }]];
    }
    
    if (query.includes("DESCRIBE `customers`")) {
      return [[
        { Field: 'customerNumber', Type: 'int(11)', Null: 'NO' },
        { Field: 'customerName', Type: 'varchar(50)', Null: 'NO' },
        { Field: 'contactLastName', Type: 'varchar(50)', Null: 'NO' },
        { Field: 'contactFirstName', Type: 'varchar(50)', Null: 'NO' },
        { Field: 'phone', Type: 'varchar(50)', Null: 'NO' },
        { Field: 'addressLine1', Type: 'varchar(50)', Null: 'NO' },
        { Field: 'addressLine2', Type: 'varchar(50)', Null: 'YES' },
        { Field: 'city', Type: 'varchar(50)', Null: 'NO' },
        { Field: 'state', Type: 'varchar(50)', Null: 'YES' },
        { Field: 'postalCode', Type: 'varchar(15)', Null: 'YES' },
        { Field: 'country', Type: 'varchar(50)', Null: 'NO' },
        { Field: 'salesRepEmployeeNumber', Type: 'int(11)', Null: 'YES' },
        { Field: 'creditLimit', Type: 'decimal(10,2)', Null: 'YES' }
      ]];
    }
    
    if (query.includes("DESCRIBE `employees`")) {
      return [[
        { Field: 'employeeNumber', Type: 'int(11)', Null: 'NO' },
        { Field: 'lastName', Type: 'varchar(50)', Null: 'NO' },
        { Field: 'firstName', Type: 'varchar(50)', Null: 'NO' },
        { Field: 'extension', Type: 'varchar(10)', Null: 'NO' },
        { Field: 'email', Type: 'varchar(100)', Null: 'NO' },
        { Field: 'officeCode', Type: 'varchar(10)', Null: 'NO' },
        { Field: 'reportsTo', Type: 'int(11)', Null: 'YES' },
        { Field: 'jobTitle', Type: 'varchar(50)', Null: 'NO' }
      ]];
    }
    
    if (query.includes("SELECT * FROM `customers` LIMIT 5")) {
      return [[
        { customerNumber: 103, customerName: 'Atelier graphique', contactLastName: 'Schmitt', contactFirstName: 'Carine', phone: '40.32.2555' },
        { customerNumber: 112, customerName: 'Signal Gift Stores', contactLastName: 'King', contactFirstName: 'Jean', phone: '7025551838' },
        { customerNumber: 114, customerName: 'Australian Collectors, Co.', contactLastName: 'Ferguson', contactFirstName: 'Peter', phone: '03 9520 4555' },
        { customerNumber: 119, customerName: 'La Rochelle Gifts', contactLastName: 'Labrune', contactFirstName: 'Janine', phone: '40.67.8555' },
        { customerNumber: 121, customerName: 'Baane Mini Imports', contactLastName: 'Bergulfsen', contactFirstName: 'Jonas', phone: '07-98 9555' }
      ]];
    }
    
    if (query.includes("SELECT * FROM `employees` LIMIT 5")) {
      return [[
        { employeeNumber: 1370, lastName: 'Hernandez', firstName: 'Gerard', extension: 'x2028', email: 'ghernande@classicmodelcars.com' },
        { employeeNumber: 1166, lastName: 'Thompson', firstName: 'Leslie', extension: 'x4065', email: 'lthompson@classicmodelcars.com' },
        { employeeNumber: 1611, lastName: 'Fixter', firstName: 'Andy', extension: 'x101', email: 'afixter@classicmodelcars.com' },
        { employeeNumber: 1504, lastName: 'Jones', firstName: 'Barry', extension: 'x102', email: 'bjones@classicmodelcars.com' },
        { employeeNumber: 1323, lastName: 'Vanauf', firstName: 'George', extension: 'x4102', email: 'gvanauf@classicmodelcars.com' }
      ]];
    }
    
    return [[]];
  }
  
  async end() {
    console.log('Mock MySQL connection closed');
  }
}

// Test the verification system
async function testVerification() {
  console.log('\n=== DB-Verify System Test ===\n');
  
  // Test request payload
  const testRequest = {
    source: {
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      user: 'test',
      password: 'test',
      database: 'classicmodels'
    },
    target: {
      type: 'postgres',
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE
    }
  };
  
  console.log('Test Configuration:');
  console.log('Source (Mock MySQL):', JSON.stringify({...testRequest.source, password: '***'}, null, 2));
  console.log('Target (PostgreSQL):', JSON.stringify({...testRequest.target, password: '***'}, null, 2));
  
  try {
    // Make API call to our verification endpoint
    const response = await fetch('http://localhost:5000/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testRequest)
    });
    
    const result = await response.json();
    
    console.log('\n=== Verification Results ===\n');
    console.log('Status:', result.summary?.status || 'ERROR');
    console.log('Message:', result.summary?.message || 'No message');
    
    if (result.comparison) {
      console.log('\nTable Comparisons:');
      result.comparison.forEach((table, index) => {
        console.log(`\n${index + 1}. Table: ${table.tableName}`);
        console.log(`   Source Rows: ${table.sourceRows}`);
        console.log(`   Target Rows: ${table.targetRows}`);
        console.log(`   Schema Match: ${table.schemaMatch}`);
        console.log(`   Status: ${table.status}`);
        
        if (table.dataMappingValidation) {
          console.log(`   Data Mapping: ${table.dataMappingValidation.isValid ? 'VALID' : 'INVALID'}`);
          if (table.dataMappingValidation.details) {
            console.log(`   Details: ${table.dataMappingValidation.details}`);
          }
        }
      });
    }
    
    if (result.stats) {
      console.log('\nStatistics:');
      console.log(`Total Tables: ${result.stats.totalTables}`);
      console.log(`Matched: ${result.stats.matchedTables}`);
      console.log(`Mismatched: ${result.stats.mismatchedTables}`);
      console.log(`Total Rows: ${result.stats.totalRows}`);
    }
    
    console.log('\n=== Test Complete ===\n');
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Override mysql2 createConnection to use our mock
const originalCreateConnection = mysql.createConnection;
mysql.createConnection = (config) => {
  console.log('Creating mock MySQL connection for:', config.database);
  return new MockMySQLConnection();
};

testVerification();