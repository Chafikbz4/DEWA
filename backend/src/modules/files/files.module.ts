import { Global, Module } from '@nestjs/common';
import { FileAccessService } from './file-access.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import {
  MALWARE_SCANNER,
  MockMalwareScanner,
} from './scanning/malware-scanner';
import { storageProviderFactory } from './storage/storage.providers';

/** Global so domain modules can attach files and register access rules. */
@Global()
@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    FileAccessService,
    storageProviderFactory,
    { provide: MALWARE_SCANNER, useClass: MockMalwareScanner },
  ],
  exports: [FilesService, FileAccessService],
})
export class FilesModule {}
