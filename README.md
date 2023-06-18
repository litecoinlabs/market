# LiteOrdex - Litecoin Ordinals Decentralized Exchange

LiteOrdex is an open source zero-fee trustless Litecoin NFT marketplace based on partially signed litecoin transactions

## How it works

The seller creates a partially signed litecoin transaction (PSBT) specifying the price of the ordinal. The buyer can then sign the PSBT and broadcast it to the network.

## How to add your collection

All inscriptions can be viewed directly via their inscription number or ID.

In addition, the homepage features collections in a random order.  
The collection data is taken from the [litecoinlabs/collections](https://github.com/litecoinlabs/collections) repo.

In order to have your collection listed, create a pull request on the [litecoinlabs/collections](https://github.com/litecoinlabs/collections) repo.

## How to run Liteordex in your localhost

Build docker image

```bash
docker build -t liteordex .
```

Run Liteordex with docker

```bash
docker run -it -d -p 8080:80 liteordex
```

Run Liteordex with hot reloading

```bash
docker run -it -d -p 8080:80 -v $(pwd):/usr/share/nginx/html liteordex
```

<img width="1057" alt="Screen Shot 2023-03-06 at 9 40 15 AM" src="https://user-images.githubusercontent.com/115091323/223142708-3eb0e8d7-08d7-4854-9d3f-32ddda7f975d.png">

## Litecoin-specific notes:

Generate bitcoinjs-lib with litecoin support:

```bash
cd other-scripts
npm install
npm run compile
# js/bitcoinjs-lib will be replaced
```

## OrdinalsLite.Market deployment instructions

#### 1. Setting up an EC2 Instance

1. Sign in to the AWS Management Console and open the Amazon EC2 console at `https://console.aws.amazon.com/ec2/`.
2. Click 'Launch Instance'
3. Select the 'Amazon Linux 2 AMI' instance type.
4. Choose a `t3.medium` instance type [(costs around $30/mo)](https://instances.vantage.sh/aws/ec2/t3.medium).
5. Set up or select a SSH key.
6. Configure the security group to use SSH (22), HTTP (80), and HTTPS (443).
7. Add storage. The default 8 GB should be enough.
8. Click 'Launch instance'.
9. Go back to the EC2 instances list, select your instance, and note down the Public IPv4 address.
10. (Optional): Set up ([allocate](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html#using-instance-addressing-eips-allocating) and [associate](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/elastic-ip-addresses-eip.html#using-instance-addressing-eips-associating)) an elastic IP with the instance.

#### 2. Setting up Nginx and Certbot

1. Connect to your instance using SSH: `ssh -i /path/my-key-pair.pem ec2-user@my-instance-public-dns-name`
2. Update the installed packages and package cache on your instance: `sudo yum update -y`
3. Install Nginx: `sudo amazon-linux-extras install nginx1.12`
4. Start Nginx service: `sudo service nginx start`
5. Enable Nginx to start on boot: `sudo chkconfig nginx on`

Now install Certbot:

6. Install EPEL (Extra Packages for Enterprise Linux) repository: `sudo amazon-linux-extras install epel -y`
7. Install Certbot and the Nginx plugin, plus Git (which we'll need later): `sudo yum install certbot python2-certbot-nginx git`

#### 3. Setting up the website

1. Remove the default Nginx configuration: `sudo rm -f /etc/nginx/conf.d/default.conf`
2. Create a new Nginx configuration file for your site: `sudo nano /etc/nginx/conf.d/my-site.conf`

Add the following content to the file:

```
server {
    listen 80;
    server_name ordinalslite.market;

    location / {
        root /usr/share/nginx/html;
    }

    # Note: This is only neccessary for older versions of nginx, e.g. 1.12
    location ~ \.wasm$ {
        types {
            application/wasm wasm;
        }
        root /usr/share/nginx/html;
    }
}
```

Make sure to replace `ordinalslite.market` with your actual domain name.

3. Save and close the file: Ctrl+X, Y, Enter.
4. Create a directory for your project: `mkdir -p ~/litecoinlabs/market`
5. Go to the newly created directory: `cd ~/litecoinlabs/market`
6. Clone this Github repository: `git clone https://github.com/litecoinlabs/market.git .`
7. Copy the content of the repository to the Nginx document root: `sudo cp -r * /usr/share/nginx/html/`
8. Restart the Nginx service: `sudo service nginx restart`

Now the website should be accessible via HTTP.

#### 4. Setting up HTTPS

1. Set up DNS for your domain to point to the Public IPv4 address / Elastic IP you got in step 1.
2. Run Certbot to get a new certificate and automatically configure Nginx: `sudo certbot --nginx`

#### 5. Setting up auto pull from Github

1. Make the update script executable: `chmod +x ~/litecoinlabs/market/update.sh`
2. Open the crontab file for editing: `crontab -e`
3. Add a new line to schedule the update script to run every 15 minutes:

```
*/15 * * * * /home/ec2-user/litecoinlabs/market/update.sh > /dev/null 2>&1
```

4. Save and exit (`:wq`, Enter). The cron job is now scheduled.

Your website should now automatically pull the latest changes from the Git repository every 15 minutes, and is accessible over HTTPS.

#### 6. (Optional) Compile bitcoinjs-lib

This appears to be necessary when moving from one OS to another.

Node instructions taken from [AWS developer guide](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-up-node-on-ec2-instance.html).

1. Download nvm: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash`
2. Activate nvm: `. ~/.nvm/nvm.sh`
3. Install Node: `nvm install 16`
4. `cd other-scripts`
5. `npm install`
6. `npm run compile`
