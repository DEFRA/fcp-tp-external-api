// aws-embedded-metrics only finds CloudWatch itself on ECS, which is where CDP runs the service.
// Anywhere else it looks for an agent that is not there, so send metrics to stdout instead.
// It reads this setting when it loads, so import this before @defra/cdp-metrics.
if (!process.env.ECS_CONTAINER_METADATA_URI) {
  process.env.AWS_EMF_ENVIRONMENT ??= 'Local'
}
