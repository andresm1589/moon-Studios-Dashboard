# Corporate authentication boundary — review source

This is a review artifact, not a deployable rules file. The deployment composer applies the guarded JSON replacements to the authoritative baseline, then inserts the electoral fragment. Every replacement carries exact before/after text and SHA-256 hashes.

Firebase authentication or electoral approval does not grant employment access. Corporate staff consists only of active CEO, Administración, Empleado, Contador, Diseño, Secretaría or Programación profiles. Legacy electoral admin roles are not corporate roles. Missing isActive preserves existing profiles; explicit false or nonboolean denies corporate access.

Public client registration matches the live marketing payload: uid, name, email, role=client and server createdAt. The client portal may update its own name and read its own requests. Account settings retain displayName, phone, bio, website, avatar, avatarHistory, settings and dispositivos; isFirstLogin can only become false. Self edits cannot assign role, reactivate isActive or set arbitrary top-level permission fields. Corporate CEO operators retain existing user management privileges.

The current dashboard source contains no conferences client and the baseline has no explicit external guest/invitation grant. Conference participants keep the existing owner/admin checks within the corporate boundary.

Public reads and creates for marketing CMS, contact forms, customer portal ownership and Fest remain available. Public allies, incidents and _system blocks are intentionally unchanged; their pre-existing anonymous writes are outside this OAuth membership patch.

Baseline normalized SHA-256: 280fad405fa3fade1ea1bc687032a7c5076484d0aa4b399d86f84c455a640baf

## Inserted helpers

~~~firestore
    // Corporate membership is independent of a Firebase or electoral sign-in.
    // Missing isActive preserves current staff; explicit false/nonboolean denies.
    function moonCompanyStaff() {
      return request.auth != null
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Empleado', 'Contador', 'Diseño', 'Secretaría', 'Programación']
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('isActive', true) == true;
    }
    function moonCompanyCEO() {
      return moonCompanyStaff()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO';
    }
    function moonCompanyAdmin() {
      return moonCompanyStaff()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['CEO', 'Administración'];
    }
    function moonSelfProfileUpdate(userId) {
      let changed = request.resource.data.diff(resource.data).affectedKeys();
      return request.auth != null && request.auth.uid == userId
        && resource.data.get('isActive', true) == true
        && changed.hasOnly(['name', 'displayName', 'phone', 'bio', 'website', 'avatar', 'avatarHistory', 'settings', 'dispositivos', 'isFirstLogin'])
        && (!changed.hasAny(['isFirstLogin']) || request.resource.data.isFirstLogin == false);
    }
~~~

## /users/{userId}

Before SHA-256: e4429f4cb679c67100b876e7f4a2a7dec4f41081f977c53d84c6ffaeff84783b
After SHA-256: 8e7026b4a5eb4203fb9a6ec92708acae643ef7187ab02e129e599a201259906b

~~~firestore
    match /users/{userId} {
      // The public customer portal may create a client profile; employment
      // roles are assigned only through an active corporate operator.
      allow create: if (request.auth != null && request.auth.uid == userId
          && request.resource.data.keys().hasOnly(['uid', 'name', 'email', 'role', 'createdAt'])
          && request.resource.data.keys().hasAll(['uid', 'name', 'email', 'role', 'createdAt'])
          && request.resource.data.uid == userId && request.resource.data.role == 'client'
          && request.resource.data.email == request.auth.token.get('email', null)
          && request.resource.data.email is string
          && request.resource.data.name is string
          && request.resource.data.name.size() >= 2 && request.resource.data.name.size() <= 320
          && request.resource.data.createdAt == request.time)
        || moonCompanyCEO()
        || (moonCompanyAdmin() && request.resource.data.role == 'Empleado');
      // Includes the authenticated account's missing profile for verification.
      allow get: if request.auth != null && request.auth.uid == userId;
      // Corporate UI uses this directory for assignment and internal messages.
      allow get, list: if moonCompanyStaff();
      allow update: if moonSelfProfileUpdate(userId) || moonCompanyCEO();
      allow delete: if moonCompanyCEO();
    }
~~~

## /discord/{document}

Before SHA-256: 0ab63bb657ca6fde34ef54f9e4e4681dd5c92d72e88bfd94205cfb7f70f50eeb
After SHA-256: 87498b94ed307a56b64503674832fee98481c21154ca166fd2d54c8e8185a234

~~~firestore
    match /discord/{document} {
      allow read: if moonCompanyStaff();
      allow write: if moonCompanyStaff() &&
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO';
    }
~~~

## /tasks/{taskId}

Before SHA-256: dc47be55642559a5696f285992d62cd617836b32b39501e6eceeae5ae0d588d7
After SHA-256: 808d21903a92e934dbf966a97db69bb95f976080e777c4f029ab611f6df708f8

~~~firestore
    match /tasks/{taskId} {
      allow read: if moonCompanyStaff();
      allow write: if moonCompanyStaff() &&
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['CEO', 'Administración'];
    }
~~~

## /announcements/{announcementId}

Before SHA-256: c6db989bfdd461427698ffec58f1cb8fb508ea58548751407843f8c8a614c742
After SHA-256: 9e1ef2746758133faa694ef88ba3e2b7a3ed77647ad9eac7f3931e65de733e92

~~~firestore
    match /announcements/{announcementId} {
      allow read: if moonCompanyStaff();
      allow write: if moonCompanyStaff() &&
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['CEO', 'Administración'];
    }
~~~

## /forms/{formId}

Before SHA-256: 42ad5f9986f7758c374da0a3cb4c8f8fc59ff14c821b254d7d94a1a728b771a5
After SHA-256: 93de3b3ca7d55f7eb0f261839c86114fe672962eefe505e6a1f4038d512a0a9c

~~~firestore
    match /forms/{formId} {
      allow create: if moonCompanyStaff() &&
                       request.resource.data.userId == request.auth.uid;
      allow read: if moonCompanyStaff() &&
                     (resource.data.userId == request.auth.uid ||
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['CEO', 'Administración']);
      allow update, delete: if moonCompanyStaff() &&
                               get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['CEO', 'Administración'];
    }
~~~

## /activityLogs/{logId}

Before SHA-256: 9c7ab25ea05b5f9f2a6a64db54528a91938a453cfd1535cefafcf3d117251ab2
After SHA-256: 6605f06ba13a8eb2dcafe3a23abac7f092df258de32c336b969c49bbb5ce5597

~~~firestore
    match /activityLogs/{logId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
      allow create: if moonCompanyStaff();
    }
~~~

## /userActivityLogs/{logId}

Before SHA-256: 13a40ffa2d9dc7fd4a297c734b39c6352c603ebcb569565adf42ae79325cf329
After SHA-256: 87ae78901d48c5552606969d83c95b1900f8a06b09267ff1d5677f4520a7becc

~~~firestore
    match /userActivityLogs/{logId} {
      allow read, list: if moonCompanyStaff() && (
        resource.data.uid == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración']
      );
      allow create: if moonCompanyStaff() &&
        request.resource.data.uid == request.auth.uid;
    }
~~~

## /userSessions/{sessionId}

Before SHA-256: 2518fe3d7e913206af31b29030ffd88ba4b9c01e09902bad639352ef904ea9ff
After SHA-256: 3cf72c846c3585df8f9726b7c596439fb40abbae880bcc0bb5db77652b6e79b4

~~~firestore
    match /userSessions/{sessionId} {
      allow read: if moonCompanyStaff() && (
        resource.data.uid == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración']
      );
      allow list: if moonCompanyStaff();
      allow create: if moonCompanyStaff() &&
        request.resource.data.uid == request.auth.uid;
      allow update: if moonCompanyStaff() && (
        resource.data.uid == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración']
      );
      allow delete: if moonCompanyStaff() && (
        resource.data.uid == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración']
      );
    }
~~~

## /sessions/{sessionId}

Before SHA-256: 8cca34577e60d975e16751d8dd9412678d4a0ec2bde7c375cde6e52a3bdba6a4
After SHA-256: 606928fc038960b9144af97d12f8e6bbe77022360b24453f47709906373ff0a9

~~~firestore
    match /sessions/{sessionId} {
      allow read: if moonCompanyStaff() && (
        resource.data.uid == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración']
      );
      allow list: if moonCompanyStaff();
      allow create: if moonCompanyStaff() &&
        request.resource.data.uid == request.auth.uid;
      allow update, delete: if moonCompanyStaff() && (
        resource.data.uid == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración']
      );
    }
~~~

## /taskReports/{reportId}

Before SHA-256: a2272f1fd5995b49a85055bff7ef4fdcf25d93469837c9a4c82b27b68fad35dd
After SHA-256: 7ba9a6ed99190b41239d7da65274b732d958640e7c7228686b070e98c34c4841

~~~firestore
    match /taskReports/{reportId} {
      allow read: if moonCompanyStaff() && (
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['CEO', 'Administración'] ||
        resource.data.reportedBy == request.auth.uid
      );
      allow list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['CEO', 'Administración'];
      allow create: if moonCompanyStaff() &&
        request.resource.data.reportedBy == request.auth.uid;
      allow update: if moonCompanyStaff() &&
        resource.data.reportedBy == request.auth.uid;
      allow delete: if moonCompanyStaff() && (
        resource.data.reportedBy == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO'
      );
    }
~~~

## /correos/{correoId}

Before SHA-256: 7e292f2a33c4daa900a44149dddd43f3c15fe64dbe8e68ba50b8939fa31773d8
After SHA-256: 182328709dbffcea47ef4f103b82136a416c376b5837c27d0ec73965c7137892

~~~firestore
    match /correos/{correoId} {
      allow get: if moonCompanyStaff() && (
        resource.data.toUid == request.auth.uid ||
        resource.data.fromUid == request.auth.uid
      );
      allow list: if moonCompanyStaff();
      allow create: if moonCompanyStaff() &&
        request.resource.data.fromUid == request.auth.uid;
      allow update: if moonCompanyStaff() && (
        resource.data.toUid == request.auth.uid ||
        resource.data.fromUid == request.auth.uid
      );
      allow delete: if moonCompanyStaff() && (
        resource.data.toUid == request.auth.uid ||
        resource.data.fromUid == request.auth.uid ||
        resource.data.deletedBy == request.auth.uid
      );
    }
~~~

## /mensajeria/{mensajeId}

Before SHA-256: b744361d5ce3ffca82391bcff4fc9d4901c16d2edf8fb3c2086b346f7019f745
After SHA-256: c01e586c888d7559a82e7282d5940a6ce1fab0555e5b75230422257aa27591d5

~~~firestore
    match /mensajeria/{mensajeId} {
      allow read, list: if moonCompanyStaff() &&
        (resource.data.toUid == request.auth.uid ||
         resource.data.fromUid == request.auth.uid);
      allow create: if moonCompanyStaff() &&
        request.resource.data.fromUid == request.auth.uid;
      allow update: if moonCompanyStaff() &&
        (resource.data.toUid == request.auth.uid ||
         resource.data.fromUid == request.auth.uid);
      allow delete: if moonCompanyStaff() &&
        (resource.data.toUid == request.auth.uid ||
         resource.data.fromUid == request.auth.uid);
    }
~~~

## /hilos/{hiloId}

Before SHA-256: b9838a6b70a6f12dbee4595a8665b62443ead8cec84d5d1832d1b48dcc3d3cb8
After SHA-256: 0518f1c27cd59e98077139c242cd8bf06da78d568db9d809308ded6f1ab08737

~~~firestore
    match /hilos/{hiloId} {
      allow get: if moonCompanyStaff();
      allow list: if moonCompanyStaff();

      allow create: if moonCompanyStaff() &&
        !request.auth.token.firebase.sign_in_provider.matches('anonymous') &&
        request.resource.data.authorUid == request.auth.uid;

      allow update: if moonCompanyStaff() &&
        !request.auth.token.firebase.sign_in_provider.matches('anonymous') && (
          resource.data.authorUid == request.auth.uid ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
            in ['CEO', 'Administración', 'Moderador'] ||
          request.resource.data.diff(resource.data).affectedKeys().hasOnly([
            'viewCount', 'subscribers', 'reactions',
            'replyCount', 'updatedAt', 'lastReplyAt'
          ])
        );

      allow delete: if moonCompanyStaff() &&
        !request.auth.token.firebase.sign_in_provider.matches('anonymous') && (
          resource.data.authorUid == request.auth.uid ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
            in ['CEO', 'Administración']
        );

      match /replies/{replyId} {
        allow get: if moonCompanyStaff();
        allow list: if moonCompanyStaff();

        allow create: if moonCompanyStaff() &&
          !request.auth.token.firebase.sign_in_provider.matches('anonymous') &&
          request.resource.data.authorUid == request.auth.uid;

        allow update: if moonCompanyStaff() &&
          !request.auth.token.firebase.sign_in_provider.matches('anonymous') && (
            resource.data.authorUid == request.auth.uid ||
            get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
              in ['CEO', 'Administración', 'Moderador'] ||
            request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactions'])
          );

        allow delete: if moonCompanyStaff() &&
          !request.auth.token.firebase.sign_in_provider.matches('anonymous') && (
            resource.data.authorUid == request.auth.uid ||
            get(/databases/$(database)/documents/hilos/$(hiloId)).data.authorUid == request.auth.uid ||
            get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
              in ['CEO', 'Administración', 'Moderador']
          );
      }

      match /presence/{userId} {
        allow read, list: if moonCompanyStaff();
        allow write: if moonCompanyStaff() &&
          !request.auth.token.firebase.sign_in_provider.matches('anonymous') &&
          request.auth.uid == userId;
      }
    }
~~~

## /notifications/{notifId}

Before SHA-256: 08f3629ce1f9b84585f630489c829e52c86ce1f3e2eb3fcb66328f62fd839239
After SHA-256: bec697b9651cce6d1367216a85493aaf3feffef10b9e0ed92d93f0c2c1c93d59

~~~firestore
    match /notifications/{notifId} {
      allow read, list: if moonCompanyStaff();
      allow create: if moonCompanyStaff();
      allow update: if moonCompanyStaff();
    }
~~~

## /contabilidad_transacciones/{docId}

Before SHA-256: c744d50ab2c8b2bd6842b120cb569d413214a10aff26dfbcdd6e8a95928ddf44
After SHA-256: 0593b9c9aa810d93d0c2cbe54cde7307f4bb28d0f14340e2c2a30cd02d33dfa9

~~~firestore
    match /contabilidad_transacciones/{docId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
      allow create, delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
    }
~~~

## /contabilidad_facturas/{docId}

Before SHA-256: c0e392c48f90e5dab2a85578973507163edceb3b44989ad7859a39f013800356
After SHA-256: ce456ecdda0b56c27579f38cd35c54ad46b94e047bfb689956c65be5ebe3c6f6

~~~firestore
    match /contabilidad_facturas/{docId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
      allow create, update, delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
    }
~~~

## /contabilidad_presupuestos/{docId}

Before SHA-256: 75ed3df1706840da0d75f2d2699a46d9ef02142974c2a1ba2d2cae51cbf45e1e
After SHA-256: 084984247610270a217d2240b92a1dcd528d1a529e85fbc45b8fc987cbe6e405

~~~firestore
    match /contabilidad_presupuestos/{docId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
      allow create, update, delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
    }
~~~

## /contabilidad_sueldos/{docId}

Before SHA-256: 55e5873ebdf58553231c8b35cbfadc972c816eda9a13476e9e6d66bbb90916ac
After SHA-256: 12168c8c6857429f55291b4e24c3bda2fd1e2a83c05e37ccd58662a895b65a60

~~~firestore
    match /contabilidad_sueldos/{docId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
      allow create, update, delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
    }
~~~

## /contabilidad_config/{docId}

Before SHA-256: dcdc118b27ad46fa1345a20b92a0316f3bcad3b4806219ee3540a9dfdf889de8
After SHA-256: 670d04ff40a6e8d9e274428e22af516d633f158d0bfc8a1ae1b352b49b664188

~~~firestore
    match /contabilidad_config/{docId} {
      allow read: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
      allow write: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
    }
~~~

## /contabilidad_asientos/{docId}

Before SHA-256: 7eb7f9161d4336c18908f1851f4f9941cf7b3ea4ed918e42ee422a5aeed96802
After SHA-256: 53d74018af44b591244d6e0cb1378023da093d802c3dfb503fdaea9d0688c272

~~~firestore
    match /contabilidad_asientos/{docId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
      allow create, update, delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
    }
~~~

## /dashboard_banners/{docId}

Before SHA-256: e7cf36779696f0a723cef77565b40ee7922db0f5d4541dfbe7f5544caebd944a
After SHA-256: 0cb7b52c15bfa8ae1603d70e5ac63de6b2548caa564a199b52bd4aa4cd2e1256

~~~firestore
    match /dashboard_banners/{docId} {
      allow read, list: if moonCompanyStaff();
      allow write: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /dashboard_config/{docId}

Before SHA-256: f09a88e94d4ebfd37f3f39aa65c8571a9e1bb261228c09ffeb25c4a94666a022
After SHA-256: 97dbd7f1a5bfca7d6c27efe18a376105a9d5ad600fd0d403126a962b9d6fef21

~~~firestore
    match /dashboard_config/{docId} {
      allow read, get: if moonCompanyStaff();
      allow write: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /contracts/{contractId}

Before SHA-256: 8c1ab3b7047f5965ffbed0b6172ef5da873cd07d4aa1f19c81282c24b7f154b7
After SHA-256: e77a33fbcede1863fbf751f408ad347079f090e8c7a438f81a3833031a2f71c1

~~~firestore
    match /contracts/{contractId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
      allow create, update, delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /conferences/{conferenceId}

Before SHA-256: 3175ad5b1bb049a70eca4694956d3a22686e2d5cd6a365a6c4da8363968ad0fa
After SHA-256: a3b5618536886d5cdf89330415619e2ba8cb85b1d7d02d30a3ed6a5675c1da12

~~~firestore
    match /conferences/{conferenceId} {
      allow read, list: if moonCompanyStaff();

      allow create: if moonCompanyStaff() &&
        request.resource.data.createdBy == request.auth.uid &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];

      allow update: if moonCompanyStaff() && (
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'] ||
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['attendees'])
      );

      allow delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];

      match /messages/{messageId} {
        allow read, list: if moonCompanyStaff();
        allow create: if moonCompanyStaff() &&
          request.resource.data.userId == request.auth.uid;
      }

      match /participants/{participantId} {
        allow read, list: if moonCompanyStaff();
        allow create, update: if moonCompanyStaff() && (
          request.auth.uid == participantId ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
            in ['CEO', 'Administración']
        );
        allow delete: if moonCompanyStaff() && (
          request.auth.uid == participantId ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
            in ['CEO', 'Administración']
        );
      }

      match /calls/{callId} {
        allow read, list: if moonCompanyStaff();
        allow create, update, delete: if moonCompanyStaff();

        match /callerCandidates/{candidateId} {
          allow read, list: if moonCompanyStaff();
          allow create, delete: if moonCompanyStaff();
        }

        match /calleeCandidates/{candidateId} {
          allow read, list: if moonCompanyStaff();
          allow create, delete: if moonCompanyStaff();
        }
      }

      match /requests/{requestId} {
        allow read, list: if moonCompanyStaff();
        allow create: if moonCompanyStaff() &&
          request.resource.data.uid == request.auth.uid;
        allow update: if moonCompanyStaff() &&
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
            in ['CEO', 'Administración'];
      }
    }
~~~

## /userInvitations/{email}

Before SHA-256: b2a0a6820fd6c34f271b0490e1b9b4e6da6725cc80c85a1dc341a29920a9d475
After SHA-256: b14ad5bef9d562fb050305dc12e90fbe3ffd3c4be484630dc34065145cb00f50

~~~firestore
    match /userInvitations/{email} {
      allow read, write: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO';
    }
~~~

## /diseno_media/{docId}

Before SHA-256: ced917a30434f57a755b6bab4e116db36d71cc2cc85cdf6706f7b898d6e0b9dd
After SHA-256: 08f3253d4c3ae510032728d4573a41cc5d5bbcb1538558bb056d2299bf0c42d7

~~~firestore
    match /diseno_media/{docId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Diseño'];
      allow create: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Diseño'] &&
        request.resource.data.uploadedBy == request.auth.uid;
      allow update: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Diseño'];
      allow delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Diseño'];
    }
~~~

## /secretaria_docs/{docId}

Before SHA-256: 0226e01b87827f3702294abad5cf4c0e85644c54f211a60a66ad7dc721c0f4f3
After SHA-256: 245be6a77575a8b73d1d72d115722c466b8d7985d23dfcb566a6759152f48e2c

~~~firestore
    match /secretaria_docs/{docId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Secretaría'];
      allow create: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Secretaría'] &&
        request.resource.data.createdBy == request.auth.uid;
      allow update: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Secretaría'];
      allow delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /dev_projects/{projectId}

Before SHA-256: ff99d65f2dc040ba717cbfd319c7670950b533bf1a37d4eeeece30602910570f
After SHA-256: 3592ce67eb0eae6c67f2493e3174c1efa62fa4568bb45daee3936af7bd842a8c

~~~firestore
    match /dev_projects/{projectId} {
      allow read, list: if moonCompanyStaff();
      allow create, update: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Programación'];
      allow delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /dev_changelog/{changeId}

Before SHA-256: a23c0dc584ebad00624b4b279c0c58dc7b148db0bd80d87fcd2ccd14ab7bf269
After SHA-256: 57661f98ba2fc2236a08d0cd130d86effdd4e2b0658c4783e8b71cb92f9316ac

~~~firestore
    match /dev_changelog/{changeId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Programación'];
      allow create: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Programación'] &&
        request.resource.data.author == request.auth.uid;
    }
~~~

## /dev_tasks/{taskId}

Before SHA-256: 2938bbff9872e368f18eaffe70c7852041543119d0196f28dc78adf54e784976
After SHA-256: d12f2274f9ba16736242bc85068a08592aab999c2e3c12e57f698074d3080680

~~~firestore
    match /dev_tasks/{taskId} {
      allow read, list: if moonCompanyStaff();
      allow create, update: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración', 'Programación'];
      allow delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /system_logs/{logId}

Before SHA-256: 12aaf57e303ebd3beb91ee023153a8de3be900ae98ee0808e3f602cc90611f2e
After SHA-256: 6db680ea972141d9c5ace506e6b192b534c26a62ca8dec371e044e5c20d8b642

~~~firestore
    match /system_logs/{logId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
      allow create: if moonCompanyStaff();
    }
~~~

## /libro_diario/{entryId}

Before SHA-256: 4eb6be3e6a83a4598c076043282ca153fa649b44ac91a1bfced98e9cc2b9f720
After SHA-256: 23d25eb5175c54059e34c0c3ac73e9264a9d9f03a443f80cd95a5820efa29f7a

~~~firestore
    match /libro_diario/{entryId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
      allow create: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'] &&
        request.resource.data.createdBy == request.auth.uid;
      allow delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Contador'];
    }
~~~

## /maintenance/{docId}

Before SHA-256: efc3a3d6692f2b462fb27f135553e016679d1f9a8fc545f92300000043616104
After SHA-256: 6591e97217e3c7a953c666c6efaa26a2e0341b11b522df4fdb73751ef18751af

~~~firestore
    match /maintenance/{docId} {
      allow read, get, list: if moonCompanyStaff();
      allow write: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO';
    }
~~~

## /maintenance/history/records/{recordId}

Before SHA-256: 9ddf86e8651e4ac21f4f23e30434563c7f9abe5985d2c06f75eb942edfc64c5f
After SHA-256: 3a38fe2d5db45b2d08aa95e35e08e2431ee2cb89f5b61bca6381b2e1e66d3f41

~~~firestore
    match /maintenance/history/records/{recordId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO';
      allow create: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO';
    }
~~~

## /uptime_snapshots/{dateDoc}

Before SHA-256: 3a6b0495518a5f777ec5e827a77a45a5c547a1e5f4726d92d4d7227f5faca1cc
After SHA-256: b1f65eb5ff49161503b8bdd58fb7058c841c7a6df652a4998366a9c7a9b9cb97

~~~firestore
    match /uptime_snapshots/{dateDoc} {
      allow read, get: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /bug_reports/{reportId}

Before SHA-256: 46bd038db73a62f4442588e2e90a59d08d5758ef9365252d33894eb973ac1a40
After SHA-256: ab0ccba8db9b0760b23486ae0cfd3144be5e6eeba0e1a2605ec95977af1f9cb2

~~~firestore
    match /bug_reports/{reportId} {
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
      allow update: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
      allow delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'CEO';
    }
~~~

## /correos_panel_moonstudios/{correoId}

Before SHA-256: 488f7939880ba403542f75e5cd47740141874dfc5c67486828441fcac76ce097
After SHA-256: ebe3eb31f43371589838c74108e25333368ce117a1d656ba467de62619fed9c0

~~~firestore
    match /correos_panel_moonstudios/{correoId} {
      allow create: if true
        && request.resource.data.keys().hasAll(['nombre', 'email', 'mensaje', 'fecha', 'leido', 'origen'])
        && request.resource.data.nombre is string
        && request.resource.data.nombre.size() >= 2
        && request.resource.data.nombre.size() <= 100
        && request.resource.data.email is string
        && request.resource.data.email.size() <= 200
        && request.resource.data.mensaje is string
        && request.resource.data.mensaje.size() >= 10
        && request.resource.data.mensaje.size() <= 2000
        && request.resource.data.leido == false
        && request.resource.data.origen in ['web_contacto', 'web_soporte_interno'];

      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];

      allow update: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];

      allow delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /moon_studios_fest_2026/{registroId}

Before SHA-256: 84d2a7cc2929b38836703983f1aef671e918bc64a7c4dcbb20b997cb5a9a2052
After SHA-256: a4435eac155b9a95d9544ddc3319f8aedc90af7ef1325efcb344899f90e73c3f

~~~firestore
    match /moon_studios_fest_2026/{registroId} {
      allow list: if true;
      allow get: if true;
      allow create: if request.resource.data.keys().hasAll(['firstName', 'lastName', 'email', 'phone'])
        && request.resource.data.firstName is string
        && request.resource.data.email is string;
      allow update, delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /config/{docId}

Before SHA-256: a10d9034a21fafb028bb13a277cbca2b99e5f9328ef90f730d75cc446094e4af
After SHA-256: 2363da3ef3e31be8e132259d1c2713dd514dcd016788cd6c85ac8c7c804322f8

~~~firestore
    match /config/{docId} {
      allow read: if true;
      allow write: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /clientes/{clienteId}

Before SHA-256: 402f0ad7f347d80b2a748923caa83b41e3f52cba721206f25866708f72aad374
After SHA-256: 02e9a12699ff13069159aa97d14f851896bdc62fccf7bf54a2aa353782a36eee

~~~firestore
    match /clientes/{clienteId} {
      allow create: if request.auth != null &&
        request.auth.uid == clienteId &&
        request.resource.data.role == 'client' &&
        request.resource.data.email == request.auth.token.email;
      allow read: if request.auth != null &&
        request.auth.uid == clienteId;
      allow update: if request.auth != null &&
        request.auth.uid == clienteId &&
        !('role' in request.resource.data.diff(resource.data).affectedKeys());
      allow read, list: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
      allow update, delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /moonStudios/equipo/items/{itemId}

Before SHA-256: 4a9f68b747501b8cd4e39a4d13897fa812842f3b28a9c64da643d225ef45c3f0
After SHA-256: 039e9489c1bab58440998752bfc99bc0e714dd7270b5799611e05e2384ad33f2

~~~firestore
    match /moonStudios/equipo/items/{itemId} {
      allow read, list: if true;
      allow create, update, delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## /moonStudios/portfolio/items/{itemId}

Before SHA-256: 086578237a806376f109889edf6ac009817283f3c54eb8bf3fca0cbe1f26da81
After SHA-256: f0bba2c2662bbb1bc2e0dad70820d488dd1f45d46ac6dd35293909b26fffe6dd

~~~firestore
    match /moonStudios/portfolio/items/{itemId} {
      allow read, list: if true;
      allow create, update, delete: if moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## function:canManageMoonPortal

Before SHA-256: bb72fd84bcba0a56d84568c0064a7f26483a4d3ba9dd0c1ad95834c81aa5a2f8
After SHA-256: facfc71295105cb43f86ad5aa0570db0d28e6b044495dedeb57cfaa316cd0ed8

~~~firestore
    function canManageMoonPortal() {
      return moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~

## function:canManageMoonWebsite

Before SHA-256: 1afa8c73eaffda41c93117f7e23e3a96cd108aa454f7a72898ac59a83def4ea5
After SHA-256: 21f03fb740911050a5a4be0a6231f7b08a4c7d059f064997a75d6ed15d137638

~~~firestore
    function canManageMoonWebsite() {
      return moonCompanyStaff() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role
          in ['CEO', 'Administración'];
    }
~~~
