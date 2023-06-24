#!/bin/bash
echo "Changing to the correct directory..."
cd /home/ec2-user/litecoinlabs/market

echo "Fetching the latest changes from the remote repository..."
git fetch

if [ $(git rev-parse HEAD) != $(git rev-parse @{u}) ]; then
  echo "Local repository is not up-to-date. Updating now..."
  git reset --hard origin/main

  echo "Generating a new version number..."
  VERSION=$(date +%s)

  echo "Updating version numbers in .html files..."
  for file in *.html; do 
    sed -i "s/js\/app.js?v=[0-9]\+/js\/app.js?v=$VERSION/g" "$file"
    sed -i "s/css\/style.css?v=[0-9]\+/css\/style.css?v=$VERSION/g" "$file"
  done

  echo "Setting execute permissions on update.sh..."
  chmod +x update.sh

  echo "Copying files to /usr/share/nginx/html/..."
  cp -r * /usr/share/nginx/html/

  echo "Restarting nginx service..."
  systemctl restart nginx

  echo "Script completed successfully!"
else
  echo "Local repository is already up-to-date."
fi