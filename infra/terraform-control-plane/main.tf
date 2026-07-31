terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.81"
    }
  }
}

provider "azurerm" {
  features {}
}

variable "project" {
  type    = string
  default = "eclipse"
}

variable "location" {
  type    = string
  default = "eastus2"
}

variable "admin_username" {
  type    = string
  default = "eclipse"
}

variable "ssh_public_key" {
  type = string
}

variable "allowed_ssh_cidrs" {
  type        = list(string)
  description = "Laptop CIDRs allowed to SSH to the control plane"
  default     = []
}

variable "allowed_ssh_cidr" {
  type        = string
  description = "Deprecated single CIDR; prefer allowed_ssh_cidrs"
  default     = ""
}

variable "vm_size" {
  type    = string
  default = "Standard_B2s"
}

variable "game_resource_group" {
  type    = string
  default = "eclipse-rg"
}

variable "game_identity_name" {
  type    = string
  default = "eclipse-mi"
}

data "azurerm_user_assigned_identity" "game_control" {
  name                = var.game_identity_name
  resource_group_name = var.game_resource_group
}

resource "azurerm_resource_group" "cp" {
  name     = "${var.project}-cp-rg"
  location = var.location
}

resource "azurerm_virtual_network" "cp" {
  name                = "${var.project}-cp-vnet"
  address_space       = ["10.50.0.0/16"]
  location            = azurerm_resource_group.cp.location
  resource_group_name = azurerm_resource_group.cp.name
}

resource "azurerm_subnet" "cp" {
  name                 = "control"
  resource_group_name  = azurerm_resource_group.cp.name
  virtual_network_name = azurerm_virtual_network.cp.name
  address_prefixes     = ["10.50.1.0/24"]
}

resource "azurerm_network_security_group" "cp" {
  name                = "${var.project}-cp-nsg"
  location            = azurerm_resource_group.cp.location
  resource_group_name = azurerm_resource_group.cp.name

  dynamic "security_rule" {
    for_each = length(var.allowed_ssh_cidrs) > 0 ? var.allowed_ssh_cidrs : (
      var.allowed_ssh_cidr != "" ? [var.allowed_ssh_cidr] : []
    )
    content {
      name                       = "ssh_${replace(replace(security_rule.value, "/", "_"), ".", "_")}"
      priority                   = 100 + security_rule.key
      direction                  = "Inbound"
      access                     = "Allow"
      protocol                   = "Tcp"
      source_port_range          = "*"
      destination_port_range     = "22"
      source_address_prefix      = security_rule.value
      destination_address_prefix = "*"
    }
  }

  security_rule {
    name                       = "panel"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "3000"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "api"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "4000"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_public_ip" "cp" {
  name                = "${var.project}-cp-pip"
  location            = azurerm_resource_group.cp.location
  resource_group_name = azurerm_resource_group.cp.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_interface" "cp" {
  name                = "${var.project}-cp-nic"
  location            = azurerm_resource_group.cp.location
  resource_group_name = azurerm_resource_group.cp.name

  ip_configuration {
    name                          = "primary"
    subnet_id                     = azurerm_subnet.cp.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.cp.id
  }
}

resource "azurerm_network_interface_security_group_association" "cp" {
  network_interface_id      = azurerm_network_interface.cp.id
  network_security_group_id = azurerm_network_security_group.cp.id
}

locals {
  cloud_init = <<-EOT
    #cloud-config
    package_update: true
    packages:
      - docker.io
      - docker-compose-v2
      - curl
      - ca-certificates
    runcmd:
      - systemctl enable --now docker
      - usermod -aG docker ${var.admin_username}
      - mkdir -p /opt/eclipse /home/${var.admin_username}/.ssh
      - chown -R ${var.admin_username}:${var.admin_username} /opt/eclipse
  EOT
}

resource "azurerm_linux_virtual_machine" "cp" {
  name                = "${var.project}-cp-vm"
  location            = azurerm_resource_group.cp.location
  resource_group_name = azurerm_resource_group.cp.name
  size                = var.vm_size
  admin_username      = var.admin_username

  network_interface_ids = [
    azurerm_network_interface.cp.id
  ]

  admin_ssh_key {
    username   = var.admin_username
    public_key = var.ssh_public_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
    disk_size_gb         = 64
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [data.azurerm_user_assigned_identity.game_control.id]
  }

  custom_data = base64encode(local.cloud_init)
}

output "control_plane_public_ip" {
  value = azurerm_public_ip.cp.ip_address
}

output "control_plane_vm_name" {
  value = azurerm_linux_virtual_machine.cp.name
}

output "control_plane_resource_group" {
  value = azurerm_resource_group.cp.name
}

output "managed_identity_client_id" {
  value = data.azurerm_user_assigned_identity.game_control.client_id
}
