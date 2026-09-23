export const updateCustomerAllFieldsMutation = `
  mutation UpdateCustomerAllFields($input: UpdateCustomerAllFieldsInput!) {
    updateCustomerAllFields(input: $input) {
      success
    }
  }
`
