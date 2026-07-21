@description('Environment suffix')
param env string = 'dev'
@description('Azure region')
param location string = resourceGroup().location
@description('SQL admin username')
param sqlAdminLogin string
@description('SQL admin password')
@secure()
param sqlAdminPassword string

var prefix = 'int-globe-${env}'

resource sqlServer 'Microsoft.Sql/servers@2023-05-01-preview' = {
  name: '${prefix}-sql'
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource sqlFirewall 'Microsoft.Sql/servers/firewallRules@2023-05-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

// Basic tier ~$5/month — cheapest fixed option
resource sqlDb 'Microsoft.Sql/servers/databases@2023-05-01-preview' = {
  parent: sqlServer
  name: 'int-globe'
  location: location
  sku: { name: 'Basic', tier: 'Basic' }
  properties: { maxSizeBytes: 2147483648 }
}

// Static Web App — Free tier ($0/month)
resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: '${prefix}-swa'
  location: 'eastus2'
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

output sqlServerFqdn   string = sqlServer.properties.fullyQualifiedDomainName
output sqlDatabaseName string = sqlDb.name
output swaDefaultHost  string = swa.properties.defaultHostname
output swaName         string = swa.name
