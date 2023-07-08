terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }

  backend "s3" {
    bucket = "llabs-tfstate"
    key = "state/terraform.tfstate"
    region = "us-east-1"
    encrypt = true
    dynamodb_table = "llabs-tfstate-lock"
  }
}

variable "bucket_name" {
  description = "The bucket name"
  type = string
  default = "llabs-static-site"
}

variable "acm_certificate_arn" {
  description = "The ACM certificate ARN"
  type = string
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_s3_bucket" "static_site" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_website_configuration" "static_site_website" {
  bucket = aws_s3_bucket.static_site.id

  index_document {
    suffix = "index.html"
  }
}

resource "aws_s3_bucket_ownership_controls" "static_site_controls" {
  bucket = aws_s3_bucket.static_site.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_public_access_block" "static_site_public_access_block" {
  bucket = aws_s3_bucket.static_site.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

module "static_files" {
  source = "hashicorp/dir/template"
  base_dir = "../site/"
}

locals {
  content_type_override = {
    ".wasm" = "application/wasm"
  }
}

resource "aws_s3_object" "static_files" {
  bucket = aws_s3_bucket.static_site.id
  for_each = module.static_files.files
  key = each.key
  source = each.value.source_path
  content = each.value.content
  etag = each.value.digests.md5

  content_type = lookup(
    local.content_type_override,
    regex("\\.[^.]+$", each.value.source_path),
    each.value.content_type
  )
}

resource "aws_s3_bucket_policy" "bucket_policy" {
  bucket = aws_s3_bucket.static_site.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicRead"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.static_site.arn}/*"
    }]
  })
}

resource "aws_cloudfront_distribution" "static_site_distribution" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Static site distribution"
  price_class         = "PriceClass_All"

  default_cache_behavior {
    target_origin_id       = "S3-${aws_s3_bucket.static_site.id}"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = false
      headers = ["Origin"]
      cookies {
        forward = "none"
      }
    }
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  origin {
    domain_name = aws_s3_bucket.static_site.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.static_site.id}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1", "TLSv1.1", "TLSv1.2"]
    }
  }

  default_root_object = "index.html"

  viewer_certificate {
    acm_certificate_arn = var.acm_certificate_arn
    ssl_support_method  = "sni-only"
  }

  aliases = ["ordinalslite.market"]
}

output "cf_distribution_domain_name" {
  description = "The domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.static_site_distribution.domain_name
}