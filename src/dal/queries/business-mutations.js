export const updateBusinessAllFieldsMutation = `
  mutation UpdateBusinessAllFields($input: UpdateBusinessAllFieldsInput!) {
    updateBusinessAllFields(input: $input) {
      success
      businessDetailsUpdated
      additionalBusinessDetailsUpdated
      business {
        sbi
      }
    }
  }
`
