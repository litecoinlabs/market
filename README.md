# OrdinalsLite.Market - Litecoin Ordinals Decentralized Exchange

OrdinalsLite.Market is an open source zero-fee trustless Litecoin NFT marketplace based on partially signed litecoin transactions

## How it works

The seller creates a partially signed litecoin transaction (PSBT) specifying the price of the ordinal. The buyer can then sign the PSBT and broadcast it to the network.

## How to add your collection

All inscriptions can be viewed directly via their inscription number or ID.

In addition, the homepage features collections in a random order.  
The collection data is taken from the [litecoinlabs/collections](https://github.com/litecoinlabs/collections) repo.

In order to have your collection listed, create a pull request on the [litecoinlabs/collections](https://github.com/litecoinlabs/collections) repo.

## How to run OrdinalsLite.Market in your localhost

Build docker image

```bash
docker build -t market .
```

Run OrdinalsLite.Market with hot reloading

```bash
docker run -it -d -p 8080:80 --name llabs-market -v $(pwd)/build:/usr/share/nginx/html market
```

![screenshot](https://github.com/litecoinlabs/market/assets/9779954/d6feaad6-692c-4db5-860f-9e9532625afb)


## Litecoin-specific notes:

Generate bitcoinjs-lib with litecoin support:

```bash
cd generate-bitcoinjs
npm install
npm run compile
# build/js/bitcoinjs-lib will be replaced
```

## Terraform deployment

1. (Optional) Modify `deployment/main.tf` to change the `aliases` if you want to deploy on a domain other than ordinalslite.market
2. Get your AWS access key ID and secret access key, and the ACM certificate ARN for the domain you want to deploy on
3. Add these to your terminal environment (.bashrc, .zshrc, or .bash_profile on Mac/Linux) using variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `TF_VAR_acm_certificate_arn` respectively
4. Run `terraform init` for the first time
5. Before every deployment, run `terraform plan`
6. When you're happy with the changes, run `terraform apply`

Be sure to add a `CNAME` record (or `ALIAS`, in the case of a root domain) on your domain for the outputted Cloudfront distribution URL given at the end of `terraform apply`

## Build HTML files

Much of the content in the HTML files is duplicated, so we've partially extracted the consistent code into seperate files.

Generate the HTML files in ./build with the following commands:

```bash
cd run-build
npm install
npm run build
# build/*.html will be replaced
```
