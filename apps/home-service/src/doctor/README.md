# Doctor Registration API Documentation

This API handles doctor registration with support for multiple file uploads (images and PDFs) for certificates and licenses.

## Features

- ✅ Multiple file upload support (images + PDFs)
- ✅ Certificate and license document handling
- ✅ Automatic file type detection and validation
- ✅ Secure file storage with organized directory structure
- ✅ JWT-based authentication for protected endpoints
- ✅ Session management with multi-device support
- ✅ Event-driven architecture with Kafka integration
- ✅ Comprehensive error handling and validation

## File Upload Structure

```
uploads/
├── doctors/
│   ├── images/          # JPEG, PNG, WEBP files
│   │   ├── certificate_*.jpg
│   │   └── license_*.png
│   ├── documents/       # PDF files
│   │   ├── certificate_*.pdf
│   │   └── license_*.pdf
│   └── misc/           # Other file types
```

## API Endpoints

### 1. Doctor Registration

**POST** `/api/v1/doctors/register`

Register a new doctor with certificate and license documents.

#### Request Format

```http
POST /api/v1/doctors/register
Content-Type: multipart/form-data

# Form Fields
firstName: "Ahmad"
middleName: "Mohammad"
lastName: "Ali"
phone: "+963912345678"
password: "SecurePassword123"
city: "Damascus"
subcity: "Mezzeh"
publicSpecialization: "HumanMedicine"
privateSpecialization: "GeneralPractitioner"
gender: "MALE"

# File Fields (Optional - choose image OR PDF for each)
certificateImage: [certificate.jpg]     # Certificate as image
licenseImage: [license.png]             # License as image
certificateDocument: [certificate.pdf]   # Certificate as PDF
licenseDocument: [license.pdf]          # License as PDF
```

#### File Upload Options

You have flexibility in how you upload documents:

1. **Images Only**: Upload `certificateImage` and `licenseImage`
2. **PDFs Only**: Upload `certificateDocument` and `licenseDocument`  
3. **Mixed**: Upload image for one, PDF for the other
4. **Both**: If you upload both image and PDF for the same document type, the image takes priority

#### Supported File Types

**Images:**
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WEBP (.webp)
- Max size: 5MB

**PDFs:**
- PDF (.pdf)
- Max size: 10MB

#### cURL Example

```bash
curl -X POST http://localhost:3001/api/v1/doctors/register \
  -H "Content-Type: multipart/form-data" \
  -F "firstName=Ahmad" \
  -F "middleName=Mohammad" \
  -F "lastName=Ali" \
  -F "phone=+963912345678" \
  -F "password=SecurePassword123" \
  -F "city=Damascus" \
  -F "subcity=Mezzeh" \
  -F "publicSpecialization=HumanMedicine" \
  -F "privateSpecialization=GeneralPractitioner" \
  -F "gender=MALE" \
  -F "certificateImage=@./certificate.jpg" \
  -F "licenseDocument=@./license.pdf"
```

#### JavaScript/Fetch Example

```javascript
const formData = new FormData();

// Add text fields
formData.append('firstName', 'Ahmad');
formData.append('middleName', 'Mohammad');
formData.append('lastName', 'Ali');
formData.append('phone', '+963912345678');
formData.append('password', 'SecurePassword123');
formData.append('city', 'Damascus');
formData.append('subcity', 'Mezzeh');
formData.append('publicSpecialization', 'HumanMedicine');
formData.append('privateSpecialization', 'GeneralPractitioner');
formData.append('gender', 'MALE');

// Add files (from input elements)
const certificateFile = document.getElementById('certificate').files[0];
const licenseFile = document.getElementById('license').files[0];

if (certificateFile) {
  formData.append('certificateImage', certificateFile);
}
if (licenseFile) {
  formData.append('licenseDocument', licenseFile);
}

// Send request
const response = await fetch('/api/v1/doctors/register', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);
```

#### Response Example

```json
{
  "success": true,
  "message": "Registration submitted successfully! Your application is under review. You will be notified once approved.",
  "doctorId": "64f123abc456def789012345",
  "status": "PENDING",
  "estimatedReviewTime": "24-48 hours",
  "uploadedFiles": {
    "certificateImage": "uploads/doctors/images/uuid123_certificate.jpg",
    "licenseImage": "uploads/doctors/documents/uuid456_license.pdf"
  }
}
```

### 2. Authentication Endpoints

#### Refresh Token
**POST** `/api/v1/doctors/refresh`
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### Get Active Sessions
**GET** `/api/v1/doctors/sessions`
```http
Authorization: Bearer <access_token>
```

#### Logout from Current Session
**POST** `/api/v1/doctors/logout`
```http
Authorization: Bearer <access_token>
```

#### Logout from Specific Device
**POST** `/api/v1/doctors/logout/device/:deviceId`
```http
Authorization: Bearer <access_token>
```

#### Logout from All Devices
**POST** `/api/v1/doctors/logout/all`
```http
Authorization: Bearer <access_token>
```

## File Access

Uploaded files are accessible via HTTP:

```
http://localhost:3001/uploads/doctors/images/uuid123_certificate.jpg
http://localhost:3001/uploads/doctors/documents/uuid456_license.pdf
```

## Error Responses

### Validation Errors
```json
{
  "statusCode": 400,
  "message": [
    "firstName must be longer than or equal to 3 characters",
    "Invalid file type. Only JPEG, PNG, WEBP, PDF are allowed"
  ],
  "error": "Bad Request"
}
```

### Duplicate Registration
```json
{
  "statusCode": 409,
  "message": "A registration request with this phone number is already pending approval. You cannot submit a new registration until your current request is processed.",
  "error": "Conflict"
}
```

### File Size Exceeded
```json
{
  "statusCode": 400,
  "message": "File too large. Maximum size for image files is 5MB",
  "error": "Bad Request"
}
```

## HTML Form Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>Doctor Registration</title>
</head>
<body>
    <h1>Doctor Registration</h1>
    
    <form action="/api/v1/doctors/register" method="POST" enctype="multipart/form-data">
        <!-- Personal Information -->
        <h3>Personal Information</h3>
        <label>First Name: <input type="text" name="firstName" required></label><br>
        <label>Middle Name: <input type="text" name="middleName" required></label><br>
        <label>Last Name: <input type="text" name="lastName" required></label><br>
        <label>Phone: <input type="tel" name="phone" placeholder="+963912345678" required></label><br>
        <label>Password: <input type="password" name="password" required></label><br>
        
        <!-- Location -->
        <h3>Location</h3>
        <label>City: 
            <select name="city" required>
                <option value="Damascus">Damascus</option>
                <option value="Aleppo">Aleppo</option>
                <option value="Homs">Homs</option>
            </select>
        </label><br>
        <label>Subcity: 
            <select name="subcity" required>
                <option value="Mezzeh">Mezzeh</option>
                <option value="Malki">Malki</option>
            </select>
        </label><br>
        
        <!-- Specialization -->
        <h3>Specialization</h3>
        <label>Public Specialization: 
            <select name="publicSpecialization" required>
                <option value="HumanMedicine">Human Medicine</option>
                <option value="Dentistry">Dentistry</option>
            </select>
        </label><br>
        <label>Private Specialization: 
            <select name="privateSpecialization" required>
                <option value="GeneralPractitioner">General Practitioner</option>
                <option value="InternalMedicine">Internal Medicine</option>
            </select>
        </label><br>
        
        <!-- Demographics -->
        <h3>Demographics</h3>
        <label>Gender: 
            <select name="gender" required>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
            </select>
        </label><br>
        
        <!-- Documents -->
        <h3>Documents</h3>
        <fieldset>
            <legend>Certificate (choose one)</legend>
            <label>Certificate Image (JPG/PNG): <input type="file" name="certificateImage" accept="image/*"></label><br>
            <label>Certificate PDF: <input type="file" name="certificateDocument" accept=".pdf"></label><br>
        </fieldset>
        
        <fieldset>
            <legend>License (choose one)</legend>
            <label>License Image (JPG/PNG): <input type="file" name="licenseImage" accept="image/*"></label><br>
            <label>License PDF: <input type="file" name="licenseDocument" accept=".pdf"></label><br>
        </fieldset>
        
        <br>
        <button type="submit">Register</button>
    </form>
</body>
</html>
```

## React Component Example

```jsx
import React, { useState } from 'react';

const DoctorRegistrationForm = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    phone: '',
    password: '',
    city: '',
    subcity: '',
    publicSpecialization: '',
    privateSpecialization: '',
    gender: '',
  });
  
  const [files, setFiles] = useState({
    certificateImage: null,
    licenseImage: null,
    certificateDocument: null,
    licenseDocument: null,
  });
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleFileChange = (e) => {
    setFiles({
      ...files,
      [e.target.name]: e.target.files[0]
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const submitData = new FormData();
    
    // Add form fields
    Object.keys(formData).forEach(key => {
      if (formData[key]) {
        submitData.append(key, formData[key]);
      }
    });
    
    // Add files
    Object.keys(files).forEach(key => {
      if (files[key]) {
        submitData.append(key, files[key]);
      }
    });

    try {
      const response = await fetch('/api/v1/doctors/register', {
        method: 'POST',
        body: submitData
      });
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Registration error:', error);
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Doctor Registration</h2>
      
      <form onSubmit={handleSubmit}>
        {/* Form fields */}
        <div>
          <label>First Name:</label>
          <input
            type="text"
            name="firstName"
            value={formData.firstName}
            onChange={handleInputChange}
            required
          />
        </div>
        
        {/* Add other form fields similarly */}
        
        {/* File uploads */}
        <div>
          <h3>Documents</h3>
          
          <div>
            <label>Certificate (Image):</label>
            <input
              type="file"
              name="certificateImage"
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>
          
          <div>
            <label>Certificate (PDF):</label>
            <input
              type="file"
              name="certificateDocument"
              accept=".pdf"
              onChange={handleFileChange}
            />
          </div>
          
          <div>
            <label>License (Image):</label>
            <input
              type="file"
              name="licenseImage"
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>
          
          <div>
            <label>License (PDF):</label>
            <input
              type="file"
              name="licenseDocument"
              accept=".pdf"
              onChange={handleFileChange}
            />
          </div>
        </div>
        
        <button type="submit" disabled={loading}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>
      
      {result && (
        <div>
          <h3>Result:</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default DoctorRegistrationForm;
```

## Environment Variables

Make sure these environment variables are set:

```env
# Application
NODE_ENV=development
APP_URL=http://localhost:3001
HOME_PORT=3001

# JWT Secrets
JWT_ACCESS_SECRET=your-access-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# Database
MONGODB_URI=mongodb://localhost:27017/tababti

# Kafka
KAFKA_BROKER=localhost:9092
```

## File Security

- Files are stored outside the web root for security
- Only specific file types are allowed
- File size limits are enforced
- Security headers are applied to served files
- File access can be controlled via middleware

## Best Practices

1. **Always validate file types** on both client and server
2. **Check file sizes** before upload to avoid large uploads
3. **Handle errors gracefully** with user-friendly messages
4. **Use HTTPS in production** to protect uploaded files
5. **Implement proper authentication** for file access
6. **Regularly clean up** unused uploaded files
7. **Monitor disk space** for uploads directory

## Testing

Use tools like:
- **Postman**: For API testing with file uploads
- **curl**: For command-line testing
- **Jest**: For unit testing the services
- **Supertest**: For integration testing

## Troubleshooting

### Common Issues

1. **File not uploading**: Check file size and type restrictions
2. **403 Forbidden**: Ensure upload directories have write permissions
3. **File not accessible**: Check static file serving configuration
4. **Memory issues**: Large files may require streaming uploads
5. **CORS errors**: Configure CORS properly for cross-origin requests

### Debugging

Enable debug logging:
```javascript
// In your service
console.log('Files received:', files);
console.log('Processed files:', processedFiles);
```

Check uploaded files:
```bash
ls -la uploads/doctors/images/
ls -la uploads/doctors/documents/
```
