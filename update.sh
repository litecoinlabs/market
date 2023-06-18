#!/bin/bash
cd ~/litecoinlabs/market
git fetch
if [ $(git rev-parse HEAD) != $(git rev-parse @{u}) ]; then
  git reset --hard
  git pull
  VERSION=$(date +%s)
  for file in *.html; do 
    sed -i "s/js\/app.js?v=[0-9]\+/js\/app.js?v=$VERSION/g" "$file"
    sed -i "s/css\/style.css?v=[0-9]\+/css\/style.css?v=$VERSION/g" "$file"
  done
  sudo cp -r * /usr/share/nginx/html/
  sudo service nginx restart
fi