output "resource_group" {
  value = azurerm_resource_group.main.name
}

output "public_ip" {
  value = azurerm_public_ip.game.ip_address
}

output "vm_id" {
  value = azurerm_linux_virtual_machine.game.id
}

output "vm_name" {
  value = azurerm_linux_virtual_machine.game.name
}

output "managed_identity_client_id" {
  value = azurerm_user_assigned_identity.control.client_id
}

output "backup_storage_account" {
  value = azurerm_storage_account.backups.name
}

output "backup_container_url" {
  value = "${azurerm_storage_account.backups.primary_blob_endpoint}${azurerm_storage_container.backups.name}"
}

output "key_vault_name" {
  value = azurerm_key_vault.main.name
}

output "data_disk_id" {
  value = azurerm_managed_disk.data.id
}
