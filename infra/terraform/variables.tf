variable "project" {
  type    = string
  default = "eclipse"
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "admin_username" {
  type    = string
  default = "eclipse"
}

variable "ssh_public_key" {
  type        = string
  description = "SSH public key for the game VM (admin login)"
}

variable "control_plane_ssh_pubkey" {
  type        = string
  description = "SSH public key of the control plane (for DOCKER_HOST=ssh:// and remote FS)"
  default     = ""
}

variable "control_plane_cidr" {
  type        = string
  description = "CIDR of the control plane host — used to allow RCON (25575) and SSH from API"
  default     = ""
}

variable "allowed_ssh_cidr" {
  type        = string
  description = "CIDR allowed to SSH (your IP/32). Empty disables admin SSH rule."
  default     = ""
}

variable "vm_size" {
  type    = string
  default = "Standard_D4s_v5"
}

variable "data_disk_size_gb" {
  type    = number
  default = 128
}

variable "minecraft_port" {
  type    = number
  default = 25565
}

variable "rcon_port" {
  type    = number
  default = 25575
}
