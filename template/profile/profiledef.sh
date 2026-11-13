#!/usr/bin/env bash
# shellcheck disable=SC2034
#
# Vesper — the profile definition.
#
# Every value here is one a student is expected to change. The comments say
# what the value *does*, not what it is called.

# The first half of the output filename: vesper-2026.11.10-x86_64.iso
iso_name="vesper"

# The ISO 9660 volume label. Must be uppercase and at most 32 characters.
iso_label="VESPER_$(date --date="@${SOURCE_DATE_EPOCH:-$(date +%s)}" +%Y%m)"

# Free-form publisher and application strings, recorded in the ISO metadata.
iso_publisher="Vesper Linux Project"
iso_application="Vesper Linux Live/Install"

# The version string. SOURCE_DATE_EPOCH is honoured so that two builds of the
# same commit produce the same image.
iso_version="$(date --date="@${SOURCE_DATE_EPOCH:-$(date +%s)}" +%Y.%m.%d)"

# Where the image's files live on the ISO. Lowercase and digits only, and at
# most 30 characters for ISO builds.
install_dir="vesper"

# Which boot loaders to bake in.
#   bios.syslinux  — booting a BIOS/CSM system
#   uefi.grub      — booting a UEFI system
bootmodes=('bios.syslinux'
           'uefi.grub')

# The pacman configuration used to *build* the image. See the comment block in
# pacman.conf for how this differs from the configuration the running ISO uses.
pacman_conf="pacman.conf"

# The image format for the root filesystem.
#   squashfs        — read-only, compressed, the classic live medium
#   ext4+squashfs   — a writable ext4 layer underneath
#   erofs           — a newer read-only format
airootfs_image_type="squashfs"
# Options passed to mksquashfs.
#
# These options belong to the compressor, not to mksquashfs. `-Xbcj` — the
# branch/call/jump filter that upstream's releng profile uses — is an **xz**
# option; zstd accepts only `-Xcompression-level`. Copying an option list
# between compressors fails at the rootfs step with a message that names the
# compressor rather than the option:
#
#     mksquashfs: Unrecognised compressor option -Xbcj
#     mksquashfs: selected compressor "zstd".  Options supported:
#         -Xcompression-level <compression-level>
#
# `mksquashfs -help-comp <compressor>` lists what a given compressor takes.
airootfs_image_tool_options=('-comp' 'zstd' '-Xcompression-level' '19' '-b' '1M')

# Files that need ownership or permissions the overlay cannot carry.
#
# Files copied out of airootfs/ arrive as 0644, owned by root, with no
# executable bit. This is the only way to give them one — see lesson 02.
file_permissions=(
  ["/etc/shadow"]="0:0:400"
)
