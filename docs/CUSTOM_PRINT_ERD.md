# Quan hệ dữ liệu

> Schema hiện tại là **5**, có thêm `mailOutbox`, `PrintJob.proof.exports/proofHistory` và `PrintSettings.exportDpi`. Chi tiết migration nằm trong [V2 remediation](VELATHIER_V2_REMEDIATION.md); sơ đồ bên dưới thể hiện mô hình nền.

```mermaid
erDiagram
  User ||--o{ CustomDesign : owns
  CustomDesign ||--|{ DesignRevision : versions
  User ||--o{ DesignAsset : uploads
  DesignRevision }o--o{ DesignAsset : references
  Product ||--o{ PrintSettings : versions
  Product ||--o| SizeChart : sizes
  User ||--o{ Order : buys
  Order ||--|{ OrderItem : contains
  OrderItem }o--o| DesignRevision : purchased
  OrderItem ||--o| PrintJob : produces
  PrintJob ||--o| Proof : active
  Order ||--o{ Notification : emits
  OrderItem ||--o| ProductReview : verified
  ProductReview }o--o{ DesignAsset : review_photos
  CustomDesign { string id PK
    string userId FK
    string productId FK
    string revisionId FK
    int currentVersion
  }
  DesignRevision { string id PK
    string designId FK
    int version
    object snapshot
    string hash
  }
  PrintJob { string id PK
    string orderId FK
    string orderLineId FK
    string designRevisionId FK
    string status
    object staffApproval
    object customerApproval
    object proof
    string productionStartedAt
  }
  Notification { string id PK
    string eventKey UK
    string orderId FK
    string status
    int attempts
  }
```

OrderItem và Proof là embedded documents, không phải collection riêng. Snapshot chứa layers, màu/size, settings và asset references. Original file ở private filesystem; hash và kích thước ở DesignAsset. Review photos có purpose=review, không được dùng làm artwork.

Collections mới: `designs`, `designRevisions`, `designAssets`, `printSettings`, `printJobs`, `sizeCharts`, `notifications`. `reviews` đã có trước đợt này; bổ sung photoAssetIds. Order thêm lineId, itemType, designSnapshot, printSettingsSnapshot, priceBreakdown, printJobId, stockConsumed, requestKey/requestHash; refundTransactions chống reference lặp. Product thêm media[]. Không đổi business IDs hoặc bắt migration lại đơn lịch sử.
