# Deploying BillTracker to a Raspberry Pi

Tested target: Raspberry Pi 5, Ubuntu Server (64-bit). Should also work on
a Pi 4 or Pi 3B+ - the app is small and Next.js's production server is
light on resources.

## Quick path

SSH into the Pi, then:

```bash
git clone https://github.com/getStartedJamesha/billtracker.git
cd billtracker
bash deploy/setup.sh
```

This installs Node.js if needed, installs dependencies, runs database
migrations, builds the app, and installs + starts it as a systemd service
(`billtracker`) that survives reboots. At the end it prints the URL to open
from another device on your home network, e.g. `http://192.168.1.42:3000`.

To update later after pulling new code: just re-run `bash deploy/setup.sh`
from inside the `billtracker` directory - it's safe to re-run.

## What the script does, step by step

If you'd rather run it by hand (or something goes wrong and you want to see
where):

```bash
# 1. Node.js 20+ (Ubuntu's apt version is often too old for Next.js 14)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Get the code
git clone https://github.com/getStartedJamesha/billtracker.git
cd billtracker

# 3. Install, migrate, build
npm install
npx prisma migrate deploy
npm run build

# 4. Run it directly (foreground, for testing)
npm start
# Open http://<pi-ip-address>:3000 from another device on the LAN
```

Once you've confirmed it works with `npm start`, stop it (Ctrl-C) and use
`deploy/setup.sh` to install it as a proper background service instead of
leaving a terminal open.

## Storage: keep the live database on the Pi, not the network share

**Do not** point `DATABASE_URL` at a WD My Cloud (or any SMB/NFS) share.
SQLite relies on file locking that network filesystems don't implement
reliably, and a network hiccup mid-write can corrupt the database. Keep
`prisma/dev.db` on the Pi's own storage (its SD card is fine for personal
use; a USB SSD is sturdier if you have one) and use the My Cloud purely as
a **backup destination** - see below.

## Backing up to the WD My Cloud

1. **Mount the My Cloud share** over SMB. First, install the client and
   create a credentials file (keeps your password out of `/etc/fstab`):

   ```bash
   sudo apt-get install -y cifs-utils
   sudo mkdir -p /mnt/mycloud
   sudo tee /etc/smbcredentials <<'EOF'
   username=YOUR_MYCLOUD_USERNAME
   password=YOUR_MYCLOUD_PASSWORD
   EOF
   sudo chmod 600 /etc/smbcredentials
   ```

2. Add it to `/etc/fstab` so it mounts automatically on boot (replace
   `mycloud.local` and `Public` with your device's hostname/IP and share
   name - check the My Cloud's dashboard if unsure):

   ```
   //mycloud.local/Public /mnt/mycloud cifs credentials=/etc/smbcredentials,uid=1000,gid=1000,iocharset=utf8 0 0
   ```

   Then mount it now without rebooting: `sudo mount -a`

3. **Run a backup manually** to check it works:

   ```bash
   sudo apt-get install -y sqlite3
   bash deploy/backup.sh
   ```

   This copies a consistent snapshot of the database (via SQLite's own
   `.backup` command, not a raw file copy) plus the uploaded bill PDFs to
   `/mnt/mycloud/billtracker-backups/`, keeping 30 days of database
   snapshots.

4. **Schedule it** with cron, e.g. nightly at 2am:

   ```bash
   crontab -e
   # add this line:
   0 2 * * * BILLTRACKER_DIR=$HOME/billtracker bash $HOME/billtracker/deploy/backup.sh >> $HOME/billtracker-backup.log 2>&1
   ```

## Accessing it away from home

For use only on your home Wi-Fi, nothing further is needed - just open
`http://<pi-ip>:3000` from your phone or laptop while on the same network.

**Do not port-forward port 3000 (or anything) straight to the internet.**
This app has no login/authentication - anyone who found the exposed port
could see and edit your bills and personal data. If you want access away
from home, install [Tailscale](https://tailscale.com/) on both the Pi and
your phone/laptop instead: it's free for personal use, encrypts
everything, and only devices you've authorized can reach the Pi, without
opening any ports on your router.

## Managing the service

```bash
sudo systemctl status billtracker     # is it running?
sudo systemctl restart billtracker    # restart
sudo journalctl -u billtracker -f     # live logs
```

## Troubleshooting

- **Build fails with an OpenSSL/Prisma engine error**: make sure you ran
  `npm install` directly on the Pi (ARM64) rather than copying over a
  `node_modules` folder built on a different machine/architecture -
  Prisma's query engine is platform-specific.
- **Port 3000 already in use**: change `Environment=PORT=3000` in
  `/etc/systemd/system/billtracker.service`, or stop whatever else is using
  it, then `sudo systemctl daemon-reload && sudo systemctl restart billtracker`.
- **`npm run build` is slow**: normal on a Pi, especially the first time
  (a couple of minutes). Subsequent builds after small changes are faster.
