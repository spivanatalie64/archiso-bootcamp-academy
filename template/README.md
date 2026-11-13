# Your flavour

This repository is **yours**. It holds the profile that describes the Arch
Linux ISO image you are building, and the pipeline that builds it.

You do not need to install anything to use it. Every commit you push is
built by our GitLab, and the finished ISO appears as a release you can
download.

```
profile/          the recipe for your image
├── profiledef.sh     what the image is called, how big, which boot modes
├── packages.x86_64   what goes inside it
├── pacman.conf       where those packages come from
├── airootfs/         files that land on the image's filesystem
├── grub/             the UEFI boot menu
└── syslinux/         the BIOS boot menu
```

## How to build it

1. Change something in `profile/`.
2. Commit it.
3. Push the commit.
4. Watch the pipeline run: **CI/CD → Pipelines**.
5. When it goes green, take the ISO from **CI/CD → Releases**.

The pipeline builds a **commit**. A change you have not committed is a change
that never gets built.

## The pipeline checks the image before you get it

A build that succeeds is not the same as a build that works, so the pipeline
does three things before publishing anything:

- it **hashes** the image, so you can check the download is the one you got,
- it checks the **volume label** matches what your profile says,
- it **boots the image headlessly** and waits for a login prompt.

If the boot test fails, the pipeline fails, and you get the last lines of the
serial console in the job log. That is the point: you are not left guessing
why your image does not work.

## Things that will bite you, and what they mean

These are real, they come up in every flavour, and the labs cover each one.

**The image boots but pacman cannot install anything.**
The image needs two systemd units, not one:
`airootfs/etc/systemd/system/etc-pacman.d-gnupg.mount` and
`airootfs/etc/systemd/system/pacman-init.service`. Ship only the service and
systemd drops it **without saying anything in the boot log**, because a
missing `Requires=` dependency is a failed dependency.

**`mksquashfs: Unrecognised compressor option -Xbcj`**
The `-X` options belong to the compressor. `-Xbcj` is an **xz** option; zstd
takes `-Xcompression-level` instead. `mksquashfs -help-comp <compressor>`
lists what yours takes.

**`error: config file mirrorlist could not be read`**
A relative `Include =` inside `profile/pacman.conf` is resolved against the
directory you are standing in, not against the profile's directory. Write the
servers out in full.

**`[mkarchiso] ERROR: Failed to set permissions on '...'`**
A `file_permissions` entry in `profiledef.sh` names a path that does not exist
in the image.

**The build fails downloading packages.**
Your profile is inheriting the build machine's mirror list, and that mirror
does not serve a package database. Pin your own mirrors.

## Asking for help

The helper in the academy answers from our wiki. For a human:
[natalie@acreetionos.org](mailto:natalie@acreetionos.org) or
[discord.acreetionos.org](https://discord.acreetionos.org).
