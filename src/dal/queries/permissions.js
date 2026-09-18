export const permissionsQuery = `
  query BusinessCustomerPermissions($sbi: ID!, $crn: ID!) {
    business(sbi: $sbi) {
      customer(crn: $crn) {
        permissionGroups {
          id
          level
        }
      }
    }
  }
`
